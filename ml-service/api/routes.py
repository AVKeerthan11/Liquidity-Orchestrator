from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from models.cash_flow_forecast import CashFlowForecaster
from models.risk_scorer import RiskScorer
from models.seir_model import SEIRModel
from models.shapley_calculator import ShapleyCalculator

router = APIRouter()


# ── Request models ─────────────────────────────────────────────────────────────

class CompanyRequest(BaseModel):
    company_id: str


class ContagionRequest(BaseModel):
    company_ids: Optional[List[str]] = None


class FinancierInput(BaseModel):
    id: str
    name: str
    capacity: float
    required_return: float


class ShapleyRequest(BaseModel):
    invoice_amount: float
    financiers: List[FinancierInput]
    supplier_risk_score: float = 50.0


class FinancingRequest(BaseModel):
    supplier_id: str
    invoice_amount: float
    days_until_due: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/predict/cashflow")
def predict_cashflow(request: CompanyRequest):
    try:
        return CashFlowForecaster().forecast(request.company_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict/risk")
def predict_risk(request: CompanyRequest):
    try:
        return RiskScorer().score(request.company_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simulate/contagion")
def simulate_contagion(request: ContagionRequest = ContagionRequest()):
    try:
        return SEIRModel().simulate(request.company_ids)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate/shapley")
def calculate_shapley(request: ShapleyRequest):
    try:
        payload = {
            "invoice_amount":     request.invoice_amount,
            "supplier_risk_score": request.supplier_risk_score,
            "financiers": [f.model_dump() for f in request.financiers],
        }
        return ShapleyCalculator().calculate(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize/financing")
def optimize_financing(request: FinancingRequest):
    try:
        return _calculate_financing_options(
            request.supplier_id,
            request.invoice_amount,
            request.days_until_due,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Financing optimizer (inline — no separate model file needed) ───────────────

def _calculate_financing_options(
    supplier_id: str,
    invoice_amount: float,
    days: int,
) -> dict:
    """
    Calculates all 3 financing options and ranks them by routing score.

    Routing Score = (0.4 * (1/cost_norm)) + (0.3 * (1/speed_norm)) + (0.3 * probability)
    cost_norm  = cost / invoice_amount   (lower cost = higher score)
    speed_norm = speed_days / max_speed  (faster = higher score)
    """
    # ── Option A: Early Payment ────────────────────────────────────────────────
    ep_rate        = 0.03
    ep_receivable  = invoice_amount * (1 - (ep_rate * days) / 365)
    ep_cost        = invoice_amount - ep_receivable
    ep_speed       = 2
    ep_probability = 0.75

    # ── Option B: Invoice Discounting ─────────────────────────────────────────
    id_rate        = 0.06
    id_receivable  = invoice_amount * (1 - (id_rate * days) / 365)
    id_cost        = invoice_amount - id_receivable
    id_speed       = 1
    id_probability = 0.95

    # ── Option C: Micro Credit ─────────────────────────────────────────────────
    mc_rate        = 0.08
    mc_repayment   = invoice_amount * (1 + (mc_rate * days) / 365)
    mc_cost        = mc_repayment - invoice_amount
    mc_speed       = 3
    mc_probability = 0.88

    options_raw = [
        ("EARLY_PAYMENT",      ep_receivable, ep_cost, ep_speed, ep_probability),
        ("INVOICE_DISCOUNTING", id_receivable, id_cost, id_speed, id_probability),
        ("MICRO_CREDIT",       invoice_amount, mc_cost, mc_speed, mc_probability),
    ]

    max_speed = max(o[3] for o in options_raw)  # for normalisation

    options = []
    for opt_type, receivable, cost, speed, prob in options_raw:
        cost_norm  = cost / invoice_amount if invoice_amount > 0 else 1
        speed_norm = speed / max_speed

        # Higher score = better: invert cost and speed norms
        routing_score = (
            0.4 * (1 / cost_norm) +
            0.3 * (1 / speed_norm) +
            0.3 * prob
        )

        options.append({
            "type":             opt_type,
            "receivable_amount": round(receivable, 2),
            "cost":             round(cost, 2),
            "speed_days":       speed,
            "probability":      prob,
            "routing_score":    round(routing_score, 4),
            "recommended":      False,
        })

    # Mark best option
    best = max(options, key=lambda x: x["routing_score"])
    best["recommended"] = True

    # Sort by routing score descending
    options.sort(key=lambda x: x["routing_score"], reverse=True)

    return {
        "supplier_id": supplier_id,
        "options":     options,
        "best_option": best["type"],
    }
