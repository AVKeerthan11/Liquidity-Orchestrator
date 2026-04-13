import os
import uuid
import random
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

def generate_mock_data():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL not set in environment.")
        return

    try:
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()

        # Create basic tables if they don't exist
        cur.execute('''
            CREATE TABLE IF NOT EXISTS company (
                id UUID PRIMARY KEY,
                name VARCHAR(255),
                type VARCHAR(50)
            )
        ''')
        cur.execute('''
            CREATE TABLE IF NOT EXISTS invoice (
                id UUID PRIMARY KEY,
                supplier_id UUID,
                buyer_id UUID,
                amount DECIMAL,
                due_date DATE,
                status VARCHAR(50),
                created_at TIMESTAMP
            )
        ''')
        cur.execute('''
            CREATE TABLE IF NOT EXISTS payment_record (
                id UUID PRIMARY KEY,
                invoice_id UUID,
                amount DECIMAL,
                payment_date DATE
            )
        ''')

        # Generate 30 companies
        buyers = [(str(uuid.uuid4()), f"Buyer {i}", "BUYER") for i in range(1, 6)]
        suppliers = [(str(uuid.uuid4()), f"Supplier {i}", "SUPPLIER") for i in range(1, 21)]
        financiers = [(str(uuid.uuid4()), f"Financier {i}", "FINANCIER") for i in range(1, 6)]

        all_companies = buyers + suppliers + financiers

        execute_values(cur, 
            "INSERT INTO company (id, name, type) VALUES %s ON CONFLICT (id) DO NOTHING",
            all_companies)

        # Generate 200 invoices with 12 months history
        invoices = []
        payments = []
        today = datetime.now()

        for _ in range(200):
            invoice_id = str(uuid.uuid4())
            supplier = random.choice(suppliers)[0]
            buyer = random.choice(buyers)[0]
            amount = round(random.uniform(1000, 50000), 2)

            days_ago = random.randint(1, 365)
            created_at = today - timedelta(days=days_ago)
            due_date = created_at + timedelta(days=random.choice([30, 45, 60, 90]))

            # Realistic delays and status
            if due_date > today:
                status = "PENDING"
            else:
                prob = random.random()
                if prob < 0.7:
                    status = "PAID"
                    payment_date = due_date + timedelta(days=random.randint(-5, 15))
                    payments.append((str(uuid.uuid4()), invoice_id, amount, payment_date.date()))
                elif prob < 0.9:
                    status = "LATE_PAID"
                    payment_date = due_date + timedelta(days=random.randint(16, 90))
                    payments.append((str(uuid.uuid4()), invoice_id, amount, payment_date.date()))
                else:
                    status = "OVERDUE"

            invoices.append((invoice_id, supplier, buyer, amount, due_date.date(), status, created_at))

        execute_values(cur,
            "INSERT INTO invoice (id, supplier_id, buyer_id, amount, due_date, status, created_at) VALUES %s ON CONFLICT (id) DO NOTHING",
            invoices)

        if payments:
            execute_values(cur,
                "INSERT INTO payment_record (id, invoice_id, amount, payment_date) VALUES %s ON CONFLICT (id) DO NOTHING",
                payments)

        conn.commit()
        print("Successfully generated and inserted 30 companies, 200 invoices, and realistic payment records.")

    except Exception as e:
        print(f"Error generating mock data: {e}")
    finally:
        if 'cur' in locals(): cur.close()
        if 'conn' in locals(): conn.close()

if __name__ == "__main__":
    generate_mock_data()
