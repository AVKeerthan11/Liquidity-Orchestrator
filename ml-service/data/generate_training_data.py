"""
Synthetic Training Data Generator — Time-Lagged Labels (No Data Leakage)
========================================================================
Each row simulates one company at one point in time.

OBSERVATION WINDOW (days 0–90):  features are computed here
LABEL WINDOW       (days 91–120): is_stressed = 1 if the company
    gets ≥2 new overdue invoices  OR
    newly overdue amount > 20% of total invoice volume in that period

This temporal separation ensures features represent current state and
the label represents a future outcome — eliminating data leakage.

Output: ml-service/data/training_data.csv  (2000 rows)
Run:    python data/generate_training_data.py
"""

import os
import numpy as np
import pandas as pd

np.random.seed(42)

N_TOTAL   = 2000
N_HEALTHY = 1550   # ~77.5%
N_STRESSED = 450   # ~22.5%

# ── Simulate one company's observation window ──────────────────────────────────

def simulate_company(profile: str) -> dict:
    """
    Simulate invoice/payment activity for one company over 120 days.
    Returns feature dict + time-lagged label.

    profile: 'healthy_clear' | 'healthy_border' | 'stressed_mild' |
             'stressed_high' | 'stressed_critical'
    """

    # ── Step 1: Generate observation-window (days 0–90) invoice activity ──────

    if profile == 'healthy_clear':
        n_invoices   = np.random.randint(8, 15)
        overdue_prob = np.random.beta(1.2, 10)        # mostly 0.05–0.20
        delay_mean   = np.random.gamma(1.5, 2)        # mostly 0–10 days
        pending_frac = np.random.beta(1.5, 7)
        pay_freq     = np.random.randint(8, 15)
        nbr_risk     = np.clip(np.random.normal(20, 8), 0, 50)
        centrality   = np.clip(np.random.beta(2, 5), 0, 1)
        # Future window: very unlikely to go overdue
        future_overdue_prob = np.random.beta(1, 12)

    elif profile == 'healthy_border':
        n_invoices   = np.random.randint(6, 12)
        overdue_prob = np.random.beta(2, 7)            # 0.10–0.35
        delay_mean   = np.random.gamma(2.5, 4)         # 0–25 days
        pending_frac = np.random.beta(2.5, 5)
        pay_freq     = np.random.randint(5, 12)
        nbr_risk     = np.clip(np.random.normal(28, 10), 0, 45)
        centrality   = np.clip(np.random.beta(2, 4), 0, 1)
        # Future window: small chance of tipping over
        future_overdue_prob = np.random.beta(1.5, 8)

    elif profile == 'stressed_mild':
        n_invoices   = np.random.randint(5, 10)
        overdue_prob = np.clip(np.random.beta(3, 4) * 0.2 + 0.30, 0.28, 0.50)
        delay_mean   = np.random.gamma(4, 5)           # 15–50 days
        pending_frac = np.random.beta(4, 4)
        pay_freq     = np.random.randint(1, 7)
        nbr_risk     = np.clip(np.random.normal(48, 12), 30, 80)
        centrality   = np.clip(np.random.beta(3, 2.5), 0, 1)
        # Future window: moderate chance of new overdues
        future_overdue_prob = np.random.beta(3, 5)

    elif profile == 'stressed_high':
        n_invoices   = np.random.randint(4, 9)
        overdue_prob = np.clip(np.random.beta(5, 3) * 0.25 + 0.45, 0.42, 0.72)
        delay_mean   = np.random.gamma(6, 5)           # 25–70 days
        pending_frac = np.random.beta(5, 3)
        pay_freq     = np.random.randint(0, 5)
        nbr_risk     = np.clip(np.random.normal(62, 14), 35, 100)
        centrality   = np.clip(np.random.beta(3, 2), 0, 1)
        future_overdue_prob = np.random.beta(5, 3)

    else:  # stressed_critical
        n_invoices   = np.random.randint(3, 8)
        overdue_prob = np.clip(np.random.beta(7, 2) * 0.25 + 0.70, 0.68, 1.0)
        delay_mean   = np.random.gamma(8, 6)           # 40–90 days
        pending_frac = np.clip(np.random.beta(6, 2), 0, 1)
        pay_freq     = np.random.randint(0, 3)
        nbr_risk     = np.clip(np.random.normal(72, 12), 40, 100)
        centrality   = np.clip(np.random.beta(4, 2), 0, 1)
        future_overdue_prob = np.random.beta(7, 2)

    # ── Step 2: Compute observation-window features ───────────────────────────

    # overdue_ratio: fraction of obs-window invoices that are overdue
    overdue_ratio = float(np.clip(overdue_prob + np.random.normal(0, 0.02), 0, 1))

    # avg_delay_days: average payment delay in obs window
    avg_delay_days = float(np.clip(
        delay_mean + overdue_ratio * 15 + np.random.normal(0, 1),
        0, 90
    ))

    # pending_ratio: fraction of invoice value still unpaid
    pending_ratio = float(np.clip(pending_frac + np.random.normal(0, 0.02), 0, 1))

    # payment_frequency: payments made in obs window
    payment_frequency = int(np.clip(pay_freq, 0, 15))

    # neighbor_avg_risk: avg risk of supply chain neighbours
    neighbor_avg_risk = float(np.clip(
        nbr_risk + centrality * 8 + np.random.normal(0, 1),
        0, 100
    ))

    # centrality_score
    centrality_score = float(np.clip(centrality + np.random.normal(0, 0.01), 0, 1))

    # ── Step 3: Simulate FUTURE window (days 91–120) — label only ────────────
    # Generate future invoices independently of obs-window features

    n_future = np.random.randint(2, 6)
    future_amounts = np.random.uniform(50000, 2000000, n_future)
    total_future_volume = float(future_amounts.sum())

    # Each future invoice becomes overdue with future_overdue_prob
    future_overdue_flags = np.random.binomial(1, future_overdue_prob, n_future)
    n_future_overdue = int(future_overdue_flags.sum())
    future_overdue_amount = float((future_amounts * future_overdue_flags).sum())

    # Label: stressed if ≥2 new overdues OR overdue amount > 20% of future volume
    overdue_amount_ratio = (
        future_overdue_amount / total_future_volume
        if total_future_volume > 0 else 0.0
    )
    is_stressed = int(
        n_future_overdue >= 2 or overdue_amount_ratio > 0.20
    )

    return {
        "overdue_ratio":     round(overdue_ratio, 6),
        "avg_delay_days":    round(avg_delay_days, 4),
        "pending_ratio":     round(pending_ratio, 6),
        "payment_frequency": payment_frequency,
        "neighbor_avg_risk": round(neighbor_avg_risk, 4),
        "centrality_score":  round(centrality_score, 6),
        "is_stressed":       is_stressed,
    }


# ── Generate rows per profile ──────────────────────────────────────────────────

PROFILE_COUNTS = {
    "healthy_clear":    1000,
    "healthy_border":   550,
    "stressed_mild":    180,
    "stressed_high":    170,
    "stressed_critical": 100,
}

rows = []
for profile, count in PROFILE_COUNTS.items():
    for _ in range(count):
        rows.append(simulate_company(profile))

df = pd.DataFrame(rows)

# ── Verify and adjust class balance ───────────────────────────────────────────
# Due to probabilistic label generation, actual stressed count may vary.
# If outside 18–27% range, resample stressed rows to hit ~22%.

stressed_count = df["is_stressed"].sum()
healthy_count  = len(df) - stressed_count
stressed_pct   = stressed_count / len(df)

print(f"Raw class balance: {stressed_count} stressed ({stressed_pct*100:.1f}%), "
      f"{healthy_count} healthy")

TARGET_STRESSED = 450
TARGET_HEALTHY  = 1550

if stressed_count != TARGET_STRESSED:
    stressed_df = df[df["is_stressed"] == 1]
    healthy_df  = df[df["is_stressed"] == 0]

    # Resample each class to exact target
    stressed_df = stressed_df.sample(
        n=TARGET_STRESSED, replace=(len(stressed_df) < TARGET_STRESSED),
        random_state=42
    )
    healthy_df = healthy_df.sample(
        n=TARGET_HEALTHY, replace=(len(healthy_df) < TARGET_HEALTHY),
        random_state=42
    )
    df = pd.concat([stressed_df, healthy_df], ignore_index=True)

# ── Shuffle ────────────────────────────────────────────────────────────────────
df = df.sample(frac=1, random_state=42).reset_index(drop=True)

# ── Derived features ──────────────────────────────────────────────────────────
# stress_velocity: rate of change in overdue ratio vs pending ratio
# positive value = deteriorating (more overdue than pending, cash crunch accelerating)
df["stress_velocity"] = df["overdue_ratio"] - df["pending_ratio"]

# contagion_score: neighbor risk weighted by how connected the node is
# high centrality + high neighbor risk = maximum contagion exposure
df["contagion_score"] = df["neighbor_avg_risk"] * df["centrality_score"]

# Enforce column order
df = df[[
    "overdue_ratio", "avg_delay_days", "pending_ratio",
    "payment_frequency", "neighbor_avg_risk", "centrality_score",
    "stress_velocity", "contagion_score",
    "is_stressed"
]]

# ── Validation ─────────────────────────────────────────────────────────────────
print("\n=== Dataset Validation ===")
print(f"Total rows:     {len(df)}")
s = df["is_stressed"].sum()
h = len(df) - s
print(f"Stressed (1):   {s}  ({s/len(df)*100:.1f}%)")
print(f"Healthy  (0):   {h}  ({h/len(df)*100:.1f}%)")

print("\n--- Feature means by label ---")
print(df.groupby("is_stressed")[[
    "overdue_ratio", "avg_delay_days", "pending_ratio",
    "payment_frequency", "neighbor_avg_risk", "centrality_score",
    "stress_velocity", "contagion_score"
]].mean().round(3).to_string())

print("\n--- Correlation with label ---")
corr = df.corr(numeric_only=True)["is_stressed"].drop("is_stressed")
print(corr.round(3).to_string())
print("\n(No feature should have |correlation| > 0.95 — that would indicate leakage)")

nan_count = df.isnull().sum().sum()
print(f"\nNaN values: {nan_count} {'✓' if nan_count == 0 else '✗ PROBLEM'}")

# ── Save ───────────────────────────────────────────────────────────────────────
out_path = os.path.join(os.path.dirname(__file__), "training_data.csv")
df.to_csv(out_path, index=False)
print(f"\nTraining data saved to ml-service/data/training_data.csv "
      f"— {len(df)} rows ready for XGBoost training")
