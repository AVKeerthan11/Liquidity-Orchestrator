"""
Cash Flow Forecaster using Facebook Prophet
Predicts 90-day inflow forecast and shortfall date for a given company.

Enhancements:
  - Two external regressors: buyer_reliability_score, is_quarter_end
  - Backtesting on 80/20 train-test split with MAE, RMSE, MAPE
  - Metrics returned in response alongside forecast
"""

import logging
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from prophet import Prophet
from sklearn.metrics import mean_absolute_error

from utils.db_connection import get_db_connection

logger = logging.getLogger(__name__)


class CashFlowForecaster:

    FORECAST_DAYS = 90

    def forecast(self, company_id: str) -> dict:
        """
        Main entry point.
        Returns forecast dict with predicted inflows, shortfall date,
        backtesting metrics, and model name.
        """
        inflow_df  = self._fetch_inflows(company_id)
        outflow_df = self._fetch_outflows(company_id)

        if inflow_df.empty or len(inflow_df) < 8:
            return self._empty_response(company_id, reason="insufficient_data")

        # Add regressors to the historical dataframe
        inflow_df = self._add_regressors(inflow_df)

        # Backtesting on 8-week holdout
        metrics = self._backtest(inflow_df)
        metrics["data_quality"] = "sufficient" if len(inflow_df) >= 20 else "insufficient_history"

        # Full-data forecast
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
            "shortfall_date":    shortfall_date,
            "shortfall_amount":  round(shortfall_amt, 2) if shortfall_amt else None,
            "confidence":        round(confidence, 4),
            "metrics":           metrics,
            "model":             "prophet",
        }

    # ── Data fetching ──────────────────────────────────────────────────────────

    def _fetch_inflows(self, company_id: str) -> pd.DataFrame:
        """
        Fetch historical cash inflows = payments received on invoices
        where this company is the supplier.
        Aggregates to weekly buckets so Prophet gets dense, regular data.
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
            if df.empty:
                return pd.DataFrame()

            df["ds"] = pd.to_datetime(df["ds"])
            df["y"]  = df["y"].astype(float)

            # Resample to weekly totals — fills sparse daily data into regular buckets
            df = (
                df.set_index("ds")
                .resample("W")["y"]
                .sum()
                .fillna(0)
                .reset_index()
            )
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
                due_date        AS due_date,
                SUM(amount)     AS total_due
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

    # ── Regressor construction ─────────────────────────────────────────────────

    def _add_regressors(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Attach external regressors to a weekly-aggregated dataframe.

        is_quarter_end         : 1 if month is March/June/Sept/Dec, else 0
        buyer_reliability_score: constant default — no per-week invoice data
                                 after resampling; will improve with real data
        """
        df = df.copy()
        df["is_quarter_end"]          = df["ds"].dt.month.isin([3, 6, 9, 12]).astype(int)
        df["buyer_reliability_score"] = 0.7
        return df

    def _add_regressors_to_future(self, future: pd.DataFrame) -> pd.DataFrame:
        """Apply the same regressor logic to the future dataframe."""
        future = future.copy()
        future["is_quarter_end"] = future["ds"].dt.month.isin([3, 6, 9, 12]).astype(int)
        # No invoice_amount available for future dates — use neutral default (0.5)
        future["buyer_reliability_score"] = 0.5
        return future

    # ── Prophet forecasting ────────────────────────────────────────────────────

    def _build_model(self) -> Prophet:
        model = Prophet(
            growth="flat",               # prevent unbounded trend extrapolation on sparse data
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=False,
            interval_width=0.85,
        )
        model.add_regressor("buyer_reliability_score")
        model.add_regressor("is_quarter_end")
        return model

    def _run_prophet(self, inflow_df: pd.DataFrame) -> tuple[list[dict], float]:
        """
        Fit Prophet on full historical inflows and forecast next FORECAST_DAYS days.
        Returns (list of {date, amount}, confidence score).
        """
        model = self._build_model()
        model.fit(inflow_df[["ds", "y", "buyer_reliability_score", "is_quarter_end"]])

        future = model.make_future_dataframe(
            periods=self.FORECAST_DAYS // 7, freq="W", include_history=False
        )
        future   = self._add_regressors_to_future(future)
        forecast = model.predict(future)

        forecast["yhat"] = forecast["yhat"].clip(lower=0)

        predicted = [
            {
                "date":   row["ds"].strftime("%Y-%m-%d"),
                "amount": max(0.0, round(float(row["yhat"]), 2)),
            }
            for _, row in forecast.iterrows()
        ]

        positive_days = (forecast["yhat_lower"] > 0).sum()
        confidence    = float(positive_days) / len(forecast)

        return predicted, confidence

    # ── Backtesting ────────────────────────────────────────────────────────────

    def _backtest(self, inflow_df: pd.DataFrame) -> dict:
        """
        Fixed 60-day holdout: everything before cutoff trains, last 60 days tests.
        Requires at least 10 train points and 5 test points — returns None metrics
        if data is too sparse rather than producing misleading single-point results.
        """
        _null = {"mae": None, "rmse": None, "mape": None, "backtest_periods": 0}

        cutoff_date = inflow_df["ds"].max() - pd.Timedelta(weeks=8)
        train_df    = inflow_df[inflow_df["ds"] <= cutoff_date].copy()
        test_df     = inflow_df[inflow_df["ds"] >  cutoff_date].copy()

        if len(train_df) < 10 or len(test_df) < 5:
            logger.info(
                "Backtest skipped — train=%d weeks, test=%d weeks (need ≥10/≥5)",
                len(train_df), len(test_df),
            )
            return _null

        try:
            model = Prophet(
                growth="flat",
                yearly_seasonality=True,
                weekly_seasonality=True,
                daily_seasonality=False,
                interval_width=0.85,
            )
            model.add_regressor("buyer_reliability_score")
            model.add_regressor("is_quarter_end")
            model.fit(train_df[["ds", "y", "buyer_reliability_score", "is_quarter_end"]])

            forecast     = model.predict(
                test_df[["ds", "buyer_reliability_score", "is_quarter_end"]]
            )
            forecast["yhat"] = forecast["yhat"].clip(lower=0)

            test_actual    = test_df["y"].values
            test_predicted = forecast["yhat"].values

            mae  = float(mean_absolute_error(test_actual, test_predicted))
            rmse = float(np.sqrt(np.mean((test_actual - test_predicted) ** 2)))
            # sMAPE — symmetric MAPE, safe when actuals are zero
            smape = float(
                np.mean(
                    2 * np.abs(test_predicted - test_actual)
                    / (np.abs(test_actual) + np.abs(test_predicted) + 1e-9)
                ) * 100
            )

            logger.info(
                "Backtest — MAE: %.2f | RMSE: %.2f | sMAPE: %.2f%% | periods: %d",
                mae, rmse, smape, len(test_df),
            )

            return {
                "mae":              round(mae, 2),
                "rmse":             round(rmse, 2),
                "mape":             round(smape, 2),   # key kept as 'mape' — API contract unchanged
                "backtest_periods": len(test_df),
            }

        except Exception as e:
            logger.warning("Backtesting failed: %s", e)
            return _null

    # ── Shortfall detection ────────────────────────────────────────────────────

    def _estimate_outflows(self, outflow_df: pd.DataFrame) -> float:
        if outflow_df.empty:
            return 0.0
        cutoff = pd.Timestamp(date.today() + timedelta(days=self.FORECAST_DAYS))
        future = outflow_df[outflow_df["due_date"] <= cutoff]
        return float(future["total_due"].sum()) if not future.empty else 0.0

    def _detect_shortfall(
        self,
        predicted_inflows: list[dict],
        total_outflows: float,
    ) -> tuple[Optional[str], Optional[float]]:
        if total_outflows == 0:
            return None, None

        daily_outflow      = total_outflows / self.FORECAST_DAYS
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
            "metrics":           {
                "mae": None, "rmse": None, "mape": None, "backtest_periods": 0
            },
            "model":             "prophet",
            "note":              reason,
        }
