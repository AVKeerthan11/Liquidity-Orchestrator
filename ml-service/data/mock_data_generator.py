"""
Mock Data Generator for Liquidity Orchestrator
Generates and inserts realistic Indian SME supply chain data into PostgreSQL (Neon)
Run: python data/mock_data_generator.py
"""

import os
import sys
import uuid
import random
from datetime import date, timedelta, datetime

import bcrypt
import psycopg2
from dotenv import load_dotenv

# ── Load env ──────────────────────────────────────────────────────────────────
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env")
    sys.exit(1)

# ── Seed for reproducibility ──────────────────────────────────────────────────
random.seed(42)

# ── Master data ───────────────────────────────────────────────────────────────
BUYERS = [
    ("Reliance Industries Ltd",   "27AAACR5055K1ZZ"),
    ("Tata Consultancy Services", "27AAACT2727Q1ZZ"),
    ("ITC Limited",               "19AAACI1681G1ZZ"),
    ("Infosys Limited",           "29AAACI1681G1ZZ"),
    ("Wipro Limited",             "29AAACW0035G1ZZ"),
]

SUPPLIERS = [
    ("Sharma Textiles Pvt Ltd",       "27AABCS1234A1ZZ"),
    ("Patel Engineering Works",       "24AABCP5678B1ZZ"),
    ("Gupta Auto Components",         "07AABCG9012C1ZZ"),
    ("Singh Packaging Solutions",     "06AABCS3456D1ZZ"),
    ("Kumar Electronics Mfg",        "29AABCK7890E1ZZ"),
    ("Mehta Chemical Industries",     "24AABCM2345F1ZZ"),
    ("Joshi Food Processing",         "27AABCJ6789G1ZZ"),
    ("Agarwal Steel Fabricators",     "08AABCA0123H1ZZ"),
    ("Verma Plastic Products",        "09AABCV4567I1ZZ"),
    ("Rao Precision Parts",           "36AABCR8901J1ZZ"),
    ("Nair Rubber Industries",        "32AABCN2345K1ZZ"),
    ("Pillai Garments Exports",       "32AABCP6789L1ZZ"),
    ("Reddy Construction Materials",  "36AABCR0123M1ZZ"),
    ("Iyer Pharma Supplies",          "33AABCI4567N1ZZ"),
    ("Bose Electronics Components",   "19AABCB8901O1ZZ"),
    ("Das Agro Products",             "21AABCD2345P1ZZ"),
    ("Mishra Furniture Works",        "09AABCM6789Q1ZZ"),
    ("Tiwari Metal Castings",         "23AABCT0123R1ZZ"),
    ("Pandey Logistics Services",     "09AABCP4567S1ZZ"),
    ("Chauhan Dairy Products",        "08AABCC8901T1ZZ"),
]

FINANCIERS = [
    ("HDFC Bank SME Fund",       "27AAACH4702H1ZZ"),
    ("ICICI Venture Capital",    "27AAACI1234V1ZZ"),
    ("Axis Bank Trade Finance",  "27AAACA5678T1ZZ"),
    ("SBI Capital Markets",      "07AAACS9012C1ZZ"),
    ("Kotak Mahindra Invest",    "27AAACK3456K1ZZ"),
]

# Stress scenario: these supplier indices (0-based) will have high overdue ratios
HIGH_STRESS_SUPPLIERS = {0, 3, 7, 12}   # 4 suppliers with 50%+ overdue
LATE_PAYER_SUPPLIERS  = {1, 5}           # 2 suppliers with consistent delays


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def company_email(name: str, role: str) -> str:
    slug = name.lower().split()[0]
    return f"admin@{slug}.{role.lower()}.in"


def random_gst_date_offset(base: date, min_days: int, max_days: int) -> date:
    return base + timedelta(days=random.randint(min_days, max_days))


# ── DB helpers ────────────────────────────────────────────────────────────────
def get_conn():
    return psycopg2.connect(DATABASE_URL)


def table_has_data(cur, table: str) -> bool:
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    return cur.fetchone()[0] > 0


# ── Insertion functions ───────────────────────────────────────────────────────
def insert_companies(cur) -> dict:
    """Returns {name: uuid} mapping for all inserted companies."""
    company_ids = {}
    rows = []

    for name, gst in BUYERS:
        cid = str(uuid.uuid4())
        rows.append((cid, name, gst, "BUYER"))
        company_ids[name] = cid

    for name, gst in SUPPLIERS:
        cid = str(uuid.uuid4())
        rows.append((cid, name, gst, "SUPPLIER"))
        company_ids[name] = cid

    for name, gst in FINANCIERS:
        cid = str(uuid.uuid4())
        rows.append((cid, name, gst, "FINANCIER"))
        company_ids[name] = cid

    cur.executemany(
        "INSERT INTO companies (id, name, gst_number, type, created_at) "
        "VALUES (%s, %s, %s, %s, NOW())",
        rows
    )
    return company_ids


def insert_users(cur, company_ids: dict):
    rows = []

    for name, _ in BUYERS:
        rows.append((str(uuid.uuid4()), company_ids[name],
                     company_email(name, "buyer"), hash_password("password123"), "BUYER"))

    for name, _ in SUPPLIERS:
        rows.append((str(uuid.uuid4()), company_ids[name],
                     company_email(name, "supplier"), hash_password("password123"), "SUPPLIER"))

    for name, _ in FINANCIERS:
        rows.append((str(uuid.uuid4()), company_ids[name],
                     company_email(name, "financier"), hash_password("password123"), "FINANCIER"))

    cur.executemany(
        "INSERT INTO users (id, company_id, email, password, role) "
        "VALUES (%s, %s, %s, %s, %s)",
        rows
    )


def insert_invoices(cur, company_ids: dict) -> list:
    """Returns list of (invoice_id, supplier_idx, status) for payment generation."""
    supplier_names = [name for name, _ in SUPPLIERS]
    buyer_names    = [name for name, _ in BUYERS]

    invoice_records = []  # (invoice_id, supplier_idx, status)
    rows = []

    base_date = date.today() - timedelta(days=365)

    for supplier_idx, supplier_name in enumerate(supplier_names):
        supplier_id = company_ids[supplier_name]
        # Each supplier gets 10-12 invoices spread across 12 months
        num_invoices = random.randint(10, 12)

        for i in range(num_invoices):
            invoice_id  = str(uuid.uuid4())
            buyer_name  = random.choice(buyer_names)
            buyer_id    = company_ids[buyer_name]
            amount      = round(random.uniform(50000, 5000000), 2)
            created_at  = base_date + timedelta(days=random.randint(0, 350))
            due_date    = created_at + timedelta(days=random.randint(30, 90))

            # Stress scenario: high-stress suppliers get 55% overdue
            if supplier_idx in HIGH_STRESS_SUPPLIERS:
                status = random.choices(
                    ["PAID", "PENDING", "OVERDUE"],
                    weights=[30, 15, 55]
                )[0]
            else:
                status = random.choices(
                    ["PAID", "PENDING", "OVERDUE"],
                    weights=[60, 25, 15]
                )[0]

            rows.append((
                invoice_id, supplier_id, buyer_id,
                amount, due_date, status, created_at
            ))
            invoice_records.append((invoice_id, supplier_idx, status))

    cur.executemany(
        "INSERT INTO invoices (id, supplier_id, buyer_id, amount, due_date, status, created_at) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        rows
    )
    return invoice_records


def insert_payments(cur, invoice_records: list):
    rows = []

    for invoice_id, supplier_idx, status in invoice_records:
        if status != "PAID":
            continue

        paid_on = date.today() - timedelta(days=random.randint(1, 180))

        # Late-payer suppliers always have delays
        if supplier_idx in LATE_PAYER_SUPPLIERS:
            delay_days = random.randint(15, 45)
        else:
            # Most on time, some slightly late
            delay_days = random.choices(
                [0, random.randint(1, 10), random.randint(11, 30)],
                weights=[60, 30, 10]
            )[0]

        amount_paid = round(random.uniform(0.9, 1.0) * 1000000, 2)  # approximate

        rows.append((
            str(uuid.uuid4()), invoice_id,
            amount_paid, paid_on, delay_days
        ))

    cur.executemany(
        "INSERT INTO payments (id, invoice_id, amount_paid, paid_on, delay_days) "
        "VALUES (%s, %s, %s, %s, %s)",
        rows
    )
    return len(rows)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("Connecting to PostgreSQL...")
    conn = get_conn()
    cur  = conn.cursor()

    try:
        # Guard: skip if data already exists
        if table_has_data(cur, "companies"):
            print("Data already exists in companies table. Skipping.")
            print("To regenerate, truncate the tables first:")
            print("  TRUNCATE payments, invoices, users, companies CASCADE;")
            return

        print("Inserting companies...", end=" ", flush=True)
        company_ids = insert_companies(cur)
        print(f"done ({len(company_ids)} companies)")

        print("Inserting users...", end=" ", flush=True)
        insert_users(cur, company_ids)
        print(f"done ({len(company_ids)} users)")

        print("Inserting invoices...", end=" ", flush=True)
        invoice_records = insert_invoices(cur, company_ids)
        print(f"done ({len(invoice_records)} invoices)")

        print("Inserting payments...", end=" ", flush=True)
        payment_count = insert_payments(cur, invoice_records)
        print(f"done ({payment_count} payments)")

        conn.commit()

        # Summary
        print("\n=== Summary ===")
        for table in ["companies", "users", "invoices", "payments"]:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            print(f"  {table}: {cur.fetchone()[0]} rows")

        print("\nStress scenarios baked in:")
        print(f"  High overdue suppliers: {[SUPPLIERS[i][0] for i in HIGH_STRESS_SUPPLIERS]}")
        print(f"  Late payer suppliers:   {[SUPPLIERS[i][0] for i in LATE_PAYER_SUPPLIERS]}")
        print("\nAll done. Mock data ready.")

    except Exception as e:
        conn.rollback()
        print(f"\nERROR: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
