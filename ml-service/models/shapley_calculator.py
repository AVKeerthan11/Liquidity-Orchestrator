"""
Shapley Value Calculator for Multi-Financier Coalition Engine
Computes fair return allocation for each financier using cooperative game theory.

Formula:
  phi_i = SUM over all subsets S not containing i:
          [ (|S|! * (n - |S| - 1)!) / n! ] * (v(S ∪ {i}) - v(S))

Coalition value function:
  v(S) = total_invoice_value_rescued(S) * (1 - weighted_risk(S))
"""

import math
import logging
from itertools import combinations
from typing import Any

logger = logging.getLogger(__name__)


class ShapleyCalculator:

    def calculate(self, payload: dict) -> dict:
        invoice_amount    = float(payload["invoice_amount"])
        financiers        = payload["financiers"]
        supplier_risk     = float(payload.get("supplier_risk_score", 50.0))

        n = len(financiers)
        if n == 0:
            return self._empty_response()

        # Normalised risk (0-1)
        risk_norm = supplier_risk / 100.0

        # Pre-index financiers
        ids = [f["id"] for f in financiers]

        # ── Compute Shapley values ─────────────────────────────────────────────
        shapley = {fid: 0.0 for fid in ids}

        for i, fi in enumerate(financiers):
            others = [j for j in range(n) if j != i]

            for size in range(n):          # |S| = 0 .. n-1
                for subset in combinations(others, size):
                    subset_financiers = [financiers[j] for j in subset]
                    subset_with_i     = subset_financiers + [fi]

                    v_with    = self._coalition_value(subset_with_i, invoice_amount, risk_norm)
                    v_without = self._coalition_value(subset_financiers, invoice_amount, risk_norm)

                    weight = (
                        math.factorial(size) * math.factorial(n - size - 1)
                    ) / math.factorial(n)

                    shapley[fi["id"]] += weight * (v_with - v_without)

        # ── Build allocations ──────────────────────────────────────────────────
        total_capacity     = sum(float(f["capacity"]) for f in financiers)
        rescue_amount      = min(total_capacity, invoice_amount)
        is_feasible        = total_capacity >= invoice_amount
        coalition_val      = self._coalition_value(financiers, invoice_amount, risk_norm)
        total_shapley      = sum(shapley.values()) or 1.0  # avoid div/0

        allocations = []
        for f in financiers:
            fid          = f["id"]
            capacity     = float(f["capacity"])
            req_return   = float(f["required_return"])
            sv           = shapley[fid]

            # Contribution proportional to capacity vs total capacity
            contribution = (capacity / total_capacity) * rescue_amount if total_capacity > 0 else 0.0

            # Fair return = share of coalition value proportional to Shapley weight
            fair_return  = (sv / total_shapley) * coalition_val * req_return
            return_rate  = fair_return / contribution if contribution > 0 else 0.0

            allocations.append({
                "financier_id":   fid,
                "financier_name": f["name"],
                "contribution":   round(contribution, 2),
                "shapley_value":  round(sv, 2),
                "fair_return":    round(fair_return, 2),
                "return_rate":    round(return_rate, 6),
            })

        # Sort by shapley value descending
        allocations.sort(key=lambda x: x["shapley_value"], reverse=True)

        return {
            "coalition_value":    round(coalition_val, 2),
            "allocations":        allocations,
            "total_rescue_amount": round(rescue_amount, 2),
            "is_feasible":        is_feasible,
        }

    # ── Coalition value function ───────────────────────────────────────────────

    def _coalition_value(
        self,
        financiers: list[dict],
        invoice_amount: float,
        risk_norm: float,
    ) -> float:
        """
        v(S) = total_invoice_value_rescued(S) * (1 - weighted_risk(S))

        weighted_risk(S) = risk_norm * (1 - diversification_discount)
        diversification_discount = 0.05 per additional financier (max 0.20)
        """
        if not financiers:
            return 0.0

        total_capacity = sum(float(f["capacity"]) for f in financiers)
        rescued        = min(total_capacity, invoice_amount)

        # More financiers = lower effective risk (diversification)
        discount       = min(0.05 * (len(financiers) - 1), 0.20)
        weighted_risk  = risk_norm * (1 - discount)

        return rescued * (1 - weighted_risk)

    def _empty_response(self) -> dict:
        return {
            "coalition_value":    0.0,
            "allocations":        [],
            "total_rescue_amount": 0.0,
            "is_feasible":        False,
        }
