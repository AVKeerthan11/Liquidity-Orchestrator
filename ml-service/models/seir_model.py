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
        if score < 30:
            return "S"
        elif score <= 60:
            return "E"
        return "I"

    def _calculate_r0(self, scored: dict, edges: list[tuple]) -> float:
        """
        R0 = mean over all nodes of:
             (infected_neighbors / total_neighbors) * TRANSMISSION_RATE

        Only nodes that have at least one neighbor contribute.
        """
        # Build adjacency: node -> set of neighbor ids
        adjacency: dict[str, set] = {cid: set() for cid in scored}
        for supplier_id, buyer_id in edges:
            if supplier_id in adjacency:
                adjacency[supplier_id].add(buyer_id)
            if buyer_id in adjacency:
                adjacency[buyer_id].add(supplier_id)

        r0_values = []
        for cid, neighbors in adjacency.items():
            if not neighbors:
                continue
            infected_neighbors = sum(
                1 for n in neighbors
                if scored.get(n, {}).get("state") == "I"
            )
            node_r0 = (infected_neighbors / len(neighbors)) * TRANSMISSION_RATE
            r0_values.append(node_r0)

        if not r0_values:
            # No edges — use global infected ratio as proxy
            total    = len(scored)
            infected = sum(1 for v in scored.values() if v["state"] == "I")
            return (infected / total * TRANSMISSION_RATE) if total > 0 else 0.0

        return sum(r0_values) / len(r0_values)

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
