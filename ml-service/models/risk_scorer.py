"""
Risk Scorer for Liquidity Orchestrator
Rule-based scoring using payment history and invoice data.
Formula: score = (overdue_ratio * 40) + (avg_delay_ratio * 30) + (pending_ratio * 30)
Capped at 100. XGBoost layer can be added once labelled training data exists.
"""

import logging
from datetime import date, timedelta, datetime

import pandas as pd
from utils.db_connection import get_db_connection

logger = logging.getLogger(__name__)


class RiskScorer:

    def score(self, company_id: str) -> dict:
        features = self._extract_features(company_id)
        if features is None:
            return self._empty_response(company_id)

        risk_score = self._calculate_score(features)
        severity   = self._severity(risk_score)

        return {
            "company_id":    company_id,
            "risk_score":    round(risk_score, 2),
            "severity":      severity,
            "features":      {
                "overdue_ratio":    round(features["overdue_ratio"], 4),
                "avg_delay_days":   round(features["avg_delay_days"], 2),
                "pending_ratio":    round(features["pending_ratio"], 4),
                "payment_frequency": features["payment_frequency"],
            },
            "calculated_at": datetime.utcnow().isoformat(),
        }

    # ── Feature extraction ─────────────────────────────────────────────────────

    def _extract_features(self, company_id: str) -> dict | None:
        conn = get_db_connection()
        if conn is None:
            return None
        try:
            # Invoice stats
            invoice_df = pd.read_sql_query(
                """
                SELECT status, amount
                FROM invoices
                WHERE supplier_id = %s
                """,
                conn, params=(company_id,)
            )

            if invoice_df.empty:
                return None

            total       = len(invoice_df)
            overdue     = (invoice_df["status"] == "OVERDUE").sum()
            pending     = invoice_df[invoice_df["status"] == "PENDING"]["amount"].sum()
            total_amt   = invoice_df["amount"].sum()

            overdue_ratio = overdue / total if total > 0 else 0.0
            pending_ratio = float(pending / total_amt) if total_amt > 0 else 0.0

            # Payment delay stats
            payment_df = pd.read_sql_query(
                """
                SELECT p.delay_days, p.paid_on
                FROM payments p
                JOIN invoices i ON i.id = p.invoice_id
                WHERE i.supplier_id = %s
                """,
                conn, params=(company_id,)
            )

            avg_delay_days   = 0.0
            payment_frequency = 0

            if not payment_df.empty:
                avg_delay_days = float(payment_df["delay_days"].fillna(0).mean())
                cutoff = date.today() - timedelta(days=90)
                payment_df["paid_on"] = pd.to_datetime(payment_df["paid_on"])
                payment_frequency = int(
                    (payment_df["paid_on"].dt.date >= cutoff).sum()
                )

            return {
                "overdue_ratio":     float(overdue_ratio),
                "avg_delay_days":    avg_delay_days,
                "pending_ratio":     float(pending_ratio),
                "payment_frequency": payment_frequency,
            }

        except Exception as e:
            logger.error("Feature extraction failed for %s: %s", company_id, e)
            return None
        finally:
            conn.close()

    # ── Scoring formula ────────────────────────────────────────────────────────

    def _calculate_score(self, f: dict) -> float:
        """
        score = (overdue_ratio * 40)
              + (min(avg_delay_days, 60) / 60 * 30)
              + (pending_ratio * 30)
        Capped at 100.
        """
        overdue_component  = f["overdue_ratio"] * 40
        delay_component    = (min(f["avg_delay_days"], 60) / 60) * 30
        pending_component  = f["pending_ratio"] * 30
        return min(overdue_component + delay_component + pending_component, 100.0)

    def _severity(self, score: float) -> str:
        if score < 30:
            return "GREEN"
        elif score <= 60:
            return "YELLOW"
        return "RED"

    def _empty_response(self, company_id: str) -> dict:
        return {
            "company_id":    company_id,
            "risk_score":    0.0,
            "severity":      "GREEN",
            "features":      {
                "overdue_ratio":     0.0,
                "avg_delay_days":    0.0,
                "pending_ratio":     0.0,
                "payment_frequency": 0,
            },
            "calculated_at": datetime.utcnow().isoformat(),
            "note":          "no_invoice_data",
        }
