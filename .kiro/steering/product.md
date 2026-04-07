# Product: Real-Time Liquidity Orchestrator for SME Supply Chains

## Problem
Small suppliers deliver goods to large buyers (like Reliance, Walmart) 
but wait 60-90 days to get paid. During this wait they run out of cash, 
get rejected by banks, and shut down — causing cascade failures across 
the entire supply chain.

## Solution
A fintech platform that:
- Maps entire supplier-buyer network as a graph
- Predicts which supplier will face cash crunch before it happens
- Automatically routes best financing solution
- Models financial stress spreading like a virus using epidemic math
- Lets buyers simulate what-if disaster scenarios

## Three User Roles
- SUPPLIER: Small businesses that deliver goods and wait to get paid
- BUYER: Large companies like Reliance that owe money to suppliers
- FINANCIER: Investors/lenders who fund rescue operations

## Core Novelty
1. Contagion detection using SEIR epidemic model + R0 calculation
2. Network-aware stress prediction using graph neighbor health as features
3. Shapley-value based multi-financier coalition engine without blockchain

## Key Formulas
1. Early Payment: P_now = P_invoice x (1 - (d x t) / 365)
2. FSRI: FSRI_node = DirectLoss + SUM(ContagionLoss of downstream neighbors)
3. Shapley Value: fair return allocation for each financier in coalition
4. R0: Basic reproduction number for financial stress spread
5. Network Stress Score: weighted combination of own risk + upstream + centrality
6. Cash Flow Shortfall: SUM(Outflows) - SUM(Expected Inflows)
7. Contagion Probability: (Invoice_ij / TotalReceivables_j) x StressScore_i
8. Invoice Discounting: P_discounted = P_invoice x (1 - (r_f x t) / 365)
9. Micro Credit: TotalRepayment = Principal x (1 + (r x t) / 365)
10. Routing Score: weighted combination of cost + speed + probability
11. Network Resilience: 1 - SUM(FSRI x Centrality) / TotalNetworkValue
12. Coalition Value: TotalInvoiceValue_rescued x (1 - WeightedRisk)

## Research Papers
1. Tabachova et al. arXiv 2305.04865 (2023) - SCN Contagion
2. MDPI Mathematics SEIR SCF (2025) - Epidemic Risk Model
3. Xia et al. Sustainability 2023 - ML Credit Risk for SMEs
4. arXiv 2511.03631 - SME Cash Flow Forecasting
5. MDPI Sustainability Shapley SCF 2023 - Game Theory in SCF