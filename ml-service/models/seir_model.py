"""
SEIR Financial Contagion Model for Liquidity Orchestrator
Models financial stress spreading through supply chain networks like an epidemic.

States:
  S = Susceptible  (risk_score < 30)
  E = Exposed      (risk_score 30-60)
  I = Infected     (risk_score > 60)
  R = Recovered    (previously infected, now < 30)

R0 = (stressed_neighbors / total_neighbors) * transmission_rate
"""

import logging
from utils.db_connection import get_db_connection
from models.risk_scorer import RiskScorer

logger = logging.getLogger(__name__)

TRANSMISSION_RATE = 2.5


class SEIRModel:

    def simulate(self, company_ids: list[str] | None = None) -> dict:
        """
        Run contagion simulation.
        If company_ids is None or empty, simulate the entire network.
        """
        # Step 1: get all companies in scope
        companies = self._fetch_companies(company_ids)
        if not companies:
            return self._empty_response()

        # Step 2: score each company
        scorer = RiskScorer()
        scored = {}  # company_id -> {name, score, state}
        for cid, name in companies.items():
            result = scorer.score(cid)
            score  = result["risk_score"]
            scored[cid] = {
                "company_id": cid,
                "name":       name,
                "score":      score,
                "state":      self._state(score),
            }

        # Step 3: build supply network edges from invoices
        edges = self._fetch_edges(list(companies.keys()))

        # Step 4: calculate R0
        r0 = self._calculate_r0(scored, edges)

        # Step 5: aggregate stats
        states      = [v["state"] for v in scored.values()]
        high_risk   = [
            {"company_id": v["company_id"], "name": v["name"], "score": round(v["score"], 2)}
            for v in scored.values() if v["state"] == "I"
        ]
        high_risk.sort(key=lambda x: x["score"], reverse=True)

        status, interpretation = self._r0_status(r0)

        return {
            "r0":            round(r0, 4),
            "status":        status,
            "interpretation": interpretation,
            "network_stats": {
                "total_companies": len(scored),
                "susceptible":     states.count("S"),
                "exposed":         states.count("E"),
                "infected":        states.count("I"),
                "recovered":       states.count("R"),
            },
            "high_risk_nodes":          high_risk,
            "intervention_recommended": r0 >= 1.0,
        }

    # ── Data fetching ──────────────────────────────────────────────────────────

    def _fetch_companies(self, company_ids: list[str] | None) -> dict:
        """Returns {company_id: name} for all companies in scope."""
        conn = get_db_connection()
        if conn is None:
            return {}
        try:
            cur = conn.cursor()
            if company_ids:
                placeholders = ",".join(["%s"] * len(company_ids))
                cur.execute(
                    f"SELECT id, name FROM companies WHERE id IN ({placeholders})",
                    company_ids
                )
            else:
                # Suppliers and buyers only — financiers don't participate in contagion
                cur.execute(
                    "SELECT id, name FROM companies WHERE type IN ('SUPPLIER', 'BUYER')"
                )
            rows = cur.fetchall()
            return {str(row[0]): row[1] for row in rows}
        except Exception as e:
            logger.error("Error fetching companies: %s", e)
            return {}
        finally:
            conn.close()

    def _fetch_edges(self, company_ids: list[str]) -> list[tuple[str, str]]:
        """
        Returns list of (supplier_id, buyer_id) edges from invoices table.
        Only includes edges where both nodes are in our company scope.
        """
        if not company_ids:
            return []
        conn = get_db_connection()
        if conn is None:
            return []
        try:
            placeholders = ",".join(["%s"] * len(company_ids))
            cur = conn.cursor()
            cur.execute(
                f"""
                SELECT DISTINCT supplier_id::text, buyer_id::text
                FROM invoices
                WHERE supplier_id IN ({placeholders})
                  AND buyer_id    IN ({placeholders})
                """,
                company_ids + company_ids
            )
            return [(row[0], row[1]) for row in cur.fetchall()]
        except Exception as e:
            logger.error("Error fetching edges: %s", e)
            return []
        finally:
            conn.close()

    # ── SEIR logic ─────────────────────────────────────────────────────────────

    def _state(self, score: float) -> str:
        if score < 15:
            return "S"
        elif score <= 25:
            return "E"
        return "I"

    def _calculate_r0(self, scored: dict, edges: list[tuple]) -> float:
        """
        R0 = (infected / total) * TRANSMISSION_RATE * network_density_factor

        This approach calculates R0 based on the proportion of infected nodes
        in the network, amplified by the transmission rate and network connectivity.
        """
        total = len(scored)
        if total == 0:
            return 0.0

        infected = sum(1 for v in scored.values() if v["state"] == "I")
        exposed = sum(1 for v in scored.values() if v["state"] == "E")

        # Network density factor based on edges per node
        density_factor = min(len(edges) / max(total, 1), 3.0)

        # R0 formula: infected ratio * transmission * density
        infected_ratio = (infected + 0.5 * exposed) / total
        r0 = infected_ratio * TRANSMISSION_RATE * max(density_factor, 1.0)

        return r0

    def _r0_status(self, r0: float) -> tuple[str, str]:
        if r0 < 1.0:
            return "GREEN",  "Financial stress is contained"
        elif r0 <= 2.0:
            return "YELLOW", "Financial stress is spreading"
        return "RED", "Critical cascade risk — immediate intervention required"

    def _empty_response(self) -> dict:
        return {
            "r0":            0.0,
            "status":        "GREEN",
            "interpretation": "No companies found for simulation",
            "network_stats": {
                "total_companies": 0,
                "susceptible": 0, "exposed": 0,
                "infected": 0,    "recovered": 0,
            },
            "high_risk_nodes":          [],
            "intervention_recommended": False,
        }
