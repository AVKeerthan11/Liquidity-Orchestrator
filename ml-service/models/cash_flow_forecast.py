"""
Cash Flow Forecaster using Facebook Prophet
Predicts 90-day inflow forecast and shortfall date for a given company.
"""

import os
import logging
from datetime import date, timedelta
from typing import Optional

import pandas as pd
import numpy as np
from prophet import Prophet
from utils.db_connection import get_db_connection

logger = logging.getLogger(__name__)


class CashFlowForecaster:

    FORECAST_DAYS = 90

    def forecast(self, company_id: str) -> dict:
        """
        Main entry point.
        Returns forecast dict with predicted inflows, shortfall date and amount.
        """
        inflow_df  = self._fetch_inflows(company_id)
        outflow_df = self._fetch_outflows(company_id)

        if inflow_df.empty or len(inflow_df) < 2:
            return self._empty_response(company_id, reason="insufficient_data")

        predicted_inflows, confidence = self._run_prophet(inflow_df)
        total_expected_outflows       = self._estimate_outflows(outflow_df)
        shortfall_date, shortfall_amt = self._detect_shortfall(
            predicted_inflows, total_expected_outflows
        )

        return {
            "company_id":        company_id,
            "forecast_days":     self.FORECAST_DAYS,
            "predicted_inflows": [
                {"date": row["date"], "amount": round(row["amount"], 2)}
                for row in predicted_inflows
            ],
            "shortfall_date":   shortfall_date,
            "shortfall_amount": round(shortfall_amt, 2) if shortfall_amt else None,
            "confidence":       round(confidence, 4),
        }

    # ── Data fetching ──────────────────────────────────────────────────────────

    def _fetch_inflows(self, company_id: str) -> pd.DataFrame:
        """
        Fetch historical cash inflows = payments received on invoices
        where this company is the supplier.
        """
        query = """
            SELECT
                p.paid_on          AS ds,
                SUM(p.amount_paid) AS y
            FROM payments p
            JOIN invoices i ON i.id = p.invoice_id
            WHERE i.supplier_id = %s
            GROUP BY p.paid_on
            ORDER BY p.paid_on
        """
        conn = get_db_connection()
        if conn is None:
            return pd.DataFrame()
        try:
            df = pd.read_sql_query(query, conn, params=(company_id,))
            df["ds"] = pd.to_datetime(df["ds"])
            df["y"]  = df["y"].astype(float)
            return df
        except Exception as e:
            logger.error("Error fetching inflows for %s: %s", company_id, e)
            return pd.DataFrame()
        finally:
            conn.close()

    def _fetch_outflows(self, company_id: str) -> pd.DataFrame:
        """
        Estimate outflows = pending invoices where this company is the buyer.
        """
        query = """
            SELECT
                due_date           AS due_date,
                SUM(amount)        AS total_due
            FROM invoices
            WHERE buyer_id = %s
              AND status IN ('PENDING', 'OVERDUE')
            GROUP BY due_date
            ORDER BY due_date
        """
        conn = get_db_connection()
        if conn is None:
            return pd.DataFrame()
        try:
            df = pd.read_sql_query(query, conn, params=(company_id,))
            df["due_date"]  = pd.to_datetime(df["due_date"])
            df["total_due"] = df["total_due"].astype(float)
            return df
        except Exception as e:
            logger.error("Error fetching outflows for %s: %s", company_id, e)
            return pd.DataFrame()
        finally:
            conn.close()

    # ── Prophet forecasting ────────────────────────────────────────────────────

    def _run_prophet(self, inflow_df: pd.DataFrame) -> tuple[list[dict], float]:
        """
        Fit Prophet on historical inflows and forecast next FORECAST_DAYS days.
        Returns (list of {date, amount}, confidence score).
        """
        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=False,
            daily_seasonality=False,
            interval_width=0.80,
            changepoint_prior_scale=0.05,
        )
        model.fit(inflow_df[["ds", "y"]])

        future = model.make_future_dataframe(
            periods=self.FORECAST_DAYS, freq="D", include_history=False
        )
        forecast = model.predict(future)

        # Clip negative predictions to 0
        forecast["yhat"] = forecast["yhat"].clip(lower=0)

        predicted = [
            {
                "date":   row["ds"].strftime("%Y-%m-%d"),
                "amount": float(row["yhat"]),
            }
            for _, row in forecast.iterrows()
        ]

        # Confidence: ratio of days where lower bound > 0
        positive_days = (forecast["yhat_lower"] > 0).sum()
        confidence    = float(positive_days) / len(forecast)

        return predicted, confidence

    # ── Shortfall detection ────────────────────────────────────────────────────

    def _estimate_outflows(self, outflow_df: pd.DataFrame) -> float:
        """
        Total expected outflows in the next FORECAST_DAYS days.
        """
        if outflow_df.empty:
            return 0.0
        cutoff = pd.Timestamp(date.today() + timedelta(days=self.FORECAST_DAYS))
        future  = outflow_df[outflow_df["due_date"] <= cutoff]
        return float(future["total_due"].sum()) if not future.empty else 0.0

    def _detect_shortfall(
        self,
        predicted_inflows: list[dict],
        total_outflows: float,
    ) -> tuple[Optional[str], Optional[float]]:
        """
        Walk through cumulative inflows day by day.
        Shortfall occurs when cumulative inflow < running outflow obligation.
        Uses a simple linear outflow distribution across forecast window.
        """
        if total_outflows == 0:
            return None, None

        daily_outflow = total_outflows / self.FORECAST_DAYS
        cumulative_inflow  = 0.0
        cumulative_outflow = 0.0

        for entry in predicted_inflows:
            cumulative_inflow  += entry["amount"]
            cumulative_outflow += daily_outflow
            if cumulative_inflow < cumulative_outflow:
                shortfall = cumulative_outflow - cumulative_inflow
                return entry["date"], shortfall

        return None, None

    # ── Fallback ───────────────────────────────────────────────────────────────

    def _empty_response(self, company_id: str, reason: str = "") -> dict:
        return {
            "company_id":        company_id,
            "forecast_days":     self.FORECAST_DAYS,
            "predicted_inflows": [],
            "shortfall_date":    None,
            "shortfall_amount":  None,
            "confidence":        0.0,
            "note":              reason,
        }
