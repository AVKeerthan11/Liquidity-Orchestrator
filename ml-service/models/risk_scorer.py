"""
Risk Scorer for Liquidity Orchestrator
---------------------------------------
Primary path : XGBoost pipeline loaded from risk_model.pkl
Fallback path: rule-based formula (if .pkl not found at startup)

Bundle schema (risk_model.pkl):
  {
    'pipeline'    : sklearn Pipeline (StandardScaler + XGBClassifier),
    'threshold'   : float  — optimal F1 threshold,
    'features'    : list[str] — 8 feature names in exact order,
    'test_f1'     : float,
    'test_roc_auc': float,
  }
"""

import logging
import os
import pickle
from datetime import date, timedelta, datetime

import pandas as pd

from utils.db_connection import get_db_connection

logger = logging.getLogger(__name__)

# ── Model bundle — loaded once at module import ────────────────────────────────

_MODEL_PATH = os.path.join(os.path.dirname(__file__), "risk_model.pkl")
_bundle: dict | None = None

try:
    with open(_MODEL_PATH, "rb") as _f:
        _bundle = pickle.load(_f)
    logger.info(
        "XGBoost risk model loaded — threshold=%.3f  features=%s",
        _bundle["threshold"],
        _bundle["features"],
    )
except FileNotFoundError:
    logger.warning(
        "risk_model.pkl not found at %s — falling back to rule-based scorer. "
        "Run ml-service/notebooks/risk_model_training.ipynb to generate the model.",
        _MODEL_PATH,
    )
except Exception as _e:
    logger.warning("Failed to load risk_model.pkl (%s) — using rule-based fallback.", _e)


# ── Public functions ───────────────────────────────────────────────────────────

def predict_risk(features_dict: dict) -> dict:
    """
    Score a single company from a pre-extracted feature dict.

    Parameters
    ----------
    features_dict : dict
        Must contain all 8 feature keys:
        overdue_ratio, avg_delay_days, pending_ratio, payment_frequency,
        neighbor_avg_risk, centrality_score, stress_velocity, contagion_score

    Returns
    -------
    dict with keys: risk_score, is_stressed, confidence, threshold, model
    """
    if _bundle is not None:
        return _predict_xgboost(features_dict)
    return _predict_rule_based(features_dict)


def get_model_metrics() -> dict:
    """Return test metrics and feature list from the loaded bundle."""
    if _bundle is None:
        return {"error": "model_not_loaded", "fallback": "rule_based"}
    return {
        "test_f1":      _bundle.get("test_f1"),
        "test_roc_auc": _bundle.get("test_roc_auc"),
        "features":     _bundle.get("features"),
        "threshold":    _bundle.get("threshold"),
        "model":        "xgboost",
    }


# ── XGBoost path ───────────────────────────────────────────────────────────────

def _predict_xgboost(features_dict: dict) -> dict:
    pipeline  = _bundle["pipeline"]
    threshold = float(_bundle["threshold"])
    features  = _bundle["features"]

    # Build single-row DataFrame in exact feature order
    df = pd.DataFrame([{k: features_dict.get(k, 0.0) for k in features}])

    prob        = float(pipeline.predict_proba(df)[:, 1][0])
    is_stressed = prob >= threshold

    return {
        "risk_score":  round(prob * 100, 2),
        "is_stressed": bool(is_stressed),
        "confidence":  round(prob, 4),
        "threshold":   round(threshold, 4),
        "model":       "xgboost",
    }


# ── Rule-based fallback ────────────────────────────────────────────────────────

def _predict_rule_based(features_dict: dict) -> dict:
    """
    score = (overdue_ratio * 40)
          + (min(avg_delay_days, 60) / 60 * 30)
          + (pending_ratio * 30)
    Capped at 100.
    """
    overdue_component = features_dict.get("overdue_ratio", 0.0) * 40
    delay_component   = (min(features_dict.get("avg_delay_days", 0.0), 60) / 60) * 30
    pending_component = features_dict.get("pending_ratio", 0.0) * 30
    score = min(overdue_component + delay_component + pending_component, 100.0)
    prob  = score / 100.0

    return {
        "risk_score":  round(score, 2),
        "is_stressed": score >= 60.0,
        "confidence":  round(prob, 4),
        "threshold":   0.60,
        "model":       "rule_based_fallback",
    }


# ── RiskScorer class (DB-backed, used by /predict/risk endpoint) ───────────────

class RiskScorer:
    """
    Extracts features from PostgreSQL for a given company_id,
    then delegates to predict_risk() (XGBoost or fallback).
    """

    def score(self, company_id: str) -> dict:
        features = self._extract_features(company_id)
        if features is None:
            return self._empty_response(company_id)

        result = predict_risk(features)
        severity = _severity(result["risk_score"])

        return {
            "company_id":    company_id,
            "risk_score":    result["risk_score"],
            "is_stressed":   result["is_stressed"],
            "severity":      severity,
            "confidence":    result["confidence"],
            "threshold":     result["threshold"],
            "model":         result["model"],
            "features":      {k: round(float(v), 4) for k, v in features.items()},
            "calculated_at": datetime.utcnow().isoformat(),
        }

    # ── Feature extraction ─────────────────────────────────────────────────────

    def _extract_features(self, company_id: str) -> dict | None:
        conn = get_db_connection()
        if conn is None:
            return None
        try:
            invoice_df = pd.read_sql_query(
                "SELECT status, amount FROM invoices WHERE supplier_id = %s",
                conn, params=(company_id,)
            )
            if invoice_df.empty:
                return None

            total     = len(invoice_df)
            overdue   = (invoice_df["status"] == "OVERDUE").sum()
            pending   = invoice_df[invoice_df["status"] == "PENDING"]["amount"].sum()
            total_amt = invoice_df["amount"].sum()

            overdue_ratio = float(overdue / total) if total > 0 else 0.0
            pending_ratio = float(pending / total_amt) if total_amt > 0 else 0.0

            payment_df = pd.read_sql_query(
                """
                SELECT p.delay_days, p.paid_on
                FROM payments p
                JOIN invoices i ON i.id = p.invoice_id
                WHERE i.supplier_id = %s
                """,
                conn, params=(company_id,)
            )

            avg_delay_days    = 0.0
            payment_frequency = 0

            if not payment_df.empty:
                avg_delay_days = float(payment_df["delay_days"].fillna(0).mean())
                cutoff = date.today() - timedelta(days=90)
                payment_df["paid_on"] = pd.to_datetime(payment_df["paid_on"])
                payment_frequency = int(
                    (payment_df["paid_on"].dt.date >= cutoff).sum()
                )

            # Network features — defaults used when graph data is unavailable
            neighbor_avg_risk = 30.0
            centrality_score  = 0.3

            # Derived features (must match generate_training_data.py)
            stress_velocity = overdue_ratio - pending_ratio
            contagion_score = neighbor_avg_risk * centrality_score

            return {
                "overdue_ratio":     overdue_ratio,
                "avg_delay_days":    avg_delay_days,
                "pending_ratio":     pending_ratio,
                "payment_frequency": payment_frequency,
                "neighbor_avg_risk": neighbor_avg_risk,
                "centrality_score":  centrality_score,
                "stress_velocity":   stress_velocity,
                "contagion_score":   contagion_score,
            }

        except Exception as e:
            logger.error("Feature extraction failed for %s: %s", company_id, e)
            return None
        finally:
            conn.close()

    def _empty_response(self, company_id: str) -> dict:
        return {
            "company_id":    company_id,
            "risk_score":    0.0,
            "is_stressed":   False,
            "severity":      "GREEN",
            "confidence":    0.0,
            "threshold":     _bundle["threshold"] if _bundle else 0.5,
            "model":         _bundle["model"] if _bundle and "model" in _bundle else "unknown",
            "features":      {},
            "calculated_at": datetime.utcnow().isoformat(),
            "note":          "no_invoice_data",
        }


def _severity(score: float) -> str:
    if score < 30:
        return "GREEN"
    elif score <= 60:
        return "YELLOW"
    return "RED"
