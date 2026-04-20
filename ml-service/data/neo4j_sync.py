"""
One-time sync script: PostgreSQL → Neo4j
Reads all companies and invoices from Neon PostgreSQL and
creates/updates Company nodes and SUPPLIES_TO relationships in Neo4j Aura.

Uses MERGE so it is safe to run multiple times.

Run from ml-service/ directory:
    python data/neo4j_sync.py
"""

import os
import sys
import psycopg2
from neo4j import GraphDatabase
from dotenv import load_dotenv

# ── Load env ──────────────────────────────────────────────────────────────────
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Support both NEON_DATABASE_URL and DATABASE_URL
PG_URL       = os.getenv("NEON_DATABASE_URL") or os.getenv("DATABASE_URL")
NEO4J_URI    = os.getenv("NEO4J_URI")
NEO4J_USER   = os.getenv("NEO4J_USERNAME")
NEO4J_PASS   = os.getenv("NEO4J_PASSWORD")

if not all([PG_URL, NEO4J_URI, NEO4J_USER, NEO4J_PASS]):
    print("ERROR: Missing required environment variables.")
    print("  Need: DATABASE_URL (or NEON_DATABASE_URL), NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD")
    sys.exit(1)


# ── PostgreSQL helpers ────────────────────────────────────────────────────────

def fetch_companies(pg_conn) -> list[dict]:
    """Fetch all companies with their latest risk score."""
    query = """
        SELECT
            c.id::text        AS id,
            c.name            AS name,
            c.type            AS type,
            COALESCE(rs.score, 0.0) AS risk_score
        FROM companies c
        LEFT JOIN LATERAL (
            SELECT score
            FROM risk_scores
            WHERE company_id = c.id
            ORDER BY calculated_at DESC
            LIMIT 1
        ) rs ON true
        ORDER BY c.type, c.name
    """
    with pg_conn.cursor() as cur:
        cur.execute(query)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def fetch_invoices(pg_conn) -> list[dict]:
    """Fetch all invoices with supplier and buyer IDs."""
    query = """
        SELECT
            id::text          AS invoice_id,
            supplier_id::text AS supplier_id,
            buyer_id::text    AS buyer_id,
            amount::float     AS invoice_amount,
            due_date::text    AS due_date,
            status            AS status
        FROM invoices
        ORDER BY created_at
    """
    with pg_conn.cursor() as cur:
        cur.execute(query)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


# ── Neo4j helpers ─────────────────────────────────────────────────────────────

def sync_companies(session, companies: list[dict]):
    """MERGE Company nodes — safe to re-run."""
    query = """
        UNWIND $companies AS c
        MERGE (n:Company {id: c.id})
        SET n.name      = c.name,
            n.type      = c.type,
            n.riskScore = c.risk_score
    """
    session.run(query, companies=companies)


def sync_relationships(session, invoices: list[dict]):
    """MERGE SUPPLIES_TO relationships keyed by invoiceId — safe to re-run."""
    query = """
        UNWIND $invoices AS inv
        MATCH (s:Company {id: inv.supplier_id})
        MATCH (b:Company {id: inv.buyer_id})
        MERGE (s)-[r:SUPPLIES_TO {invoiceId: inv.invoice_id}]->(b)
        SET r.invoiceAmount = inv.invoice_amount,
            r.dueDate       = inv.due_date,
            r.status        = inv.status
    """
    session.run(query, invoices=invoices)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # Connect to PostgreSQL
    print("Connecting to PostgreSQL (Neon)...", end=" ", flush=True)
    pg_conn = psycopg2.connect(PG_URL)
    print("connected.")

    # Fetch data
    print("Fetching companies...", end=" ", flush=True)
    companies = fetch_companies(pg_conn)
    print(f"{len(companies)} found.")

    print("Fetching invoices...", end=" ", flush=True)
    invoices = fetch_invoices(pg_conn)
    print(f"{len(invoices)} found.")
    pg_conn.close()

   # Connect to Neo4j
    print("Connecting to Neo4j (Aura)...", end=" ", flush=True)
    import ssl
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    # Strip +s scheme and use plain neo4j:// so ssl_context can be passed
    uri = NEO4J_URI.replace("neo4j+s://", "neo4j://").replace("bolt+s://", "bolt://")
    driver = GraphDatabase.driver(uri, auth=(NEO4J_USER, NEO4J_PASS), ssl_context=ssl_context)
    driver.verify_connectivity()
    print("connected.")

    with driver.session() as session:
        # Sync company nodes
        print(f"Syncing {len(companies)} Company nodes...", end=" ", flush=True)
        # Process in batches of 100 to avoid large parameter payloads
        for i in range(0, len(companies), 100):
            sync_companies(session, companies[i:i+100])
        print("done.")

        # Sync relationships
        print(f"Syncing {len(invoices)} SUPPLIES_TO relationships...", end=" ", flush=True)
        for i in range(0, len(invoices), 100):
            sync_relationships(session, invoices[i:i+100])
        print("done.")

        # Verify
        result = session.run("MATCH (n:Company) RETURN count(n) AS nodes")
        node_count = result.single()["nodes"]

        result = session.run("MATCH ()-[r:SUPPLIES_TO]->() RETURN count(r) AS rels")
        rel_count = result.single()["rels"]

    driver.close()

    print("\n=== Sync Complete ===")
    print(f"  Company nodes in Neo4j:       {node_count}")
    print(f"  SUPPLIES_TO relationships:    {rel_count}")
    print(f"  Expected companies:           {len(companies)}")
    print(f"  Expected relationships:       {len(invoices)}")

    if node_count == len(companies) and rel_count == len(invoices):
        print("\nAll data synced successfully.")
    else:
        print("\nWARNING: Counts don't match — some nodes/relationships may have been skipped.")
        print("  Check that all supplier_id and buyer_id values exist in the companies table.")


if __name__ == "__main__":
    main()
