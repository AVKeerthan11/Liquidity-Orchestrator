package com.netcredix.jbackend.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class MLService {

    private final RestTemplate restTemplate;
    private final String baseUrl;

    public MLService(
            @Qualifier("mlRestTemplate") RestTemplate restTemplate,
            @Value("${ml.service.url}") String baseUrl) {
        this.restTemplate = restTemplate;
        this.baseUrl = baseUrl;
    }

    /**
     * POST /predict/cashflow
     * Returns 90-day cash flow forecast for a supplier company.
     */
    public Map<String, Object> callCashFlowForecast(String companyId) {
        Map<String, Object> body = Map.of("company_id", companyId);
        return post("/predict/cashflow", body);
    }

    /**
     * POST /predict/risk
     * Returns XGBoost/rule-based risk score for a company.
     */
    public Map<String, Object> callRiskScore(String companyId) {
        Map<String, Object> body = Map.of("company_id", companyId);
        return post("/predict/risk", body);
    }

    /**
     * POST /simulate/contagion
     * Runs SEIR contagion simulation across the supply network.
     * Pass null or empty list to simulate entire network.
     */
    public Map<String, Object> callContagionSimulation(List<String> companyIds) {
        Map<String, Object> body = new HashMap<>();
        body.put("company_ids", companyIds);
        return post("/simulate/contagion", body);
    }

    /**
     * POST /optimize/financing
     * Returns ranked financing options for a supplier invoice.
     */
    public Map<String, Object> callFinancingOptimizer(
            String supplierId, BigDecimal amount, int daysUntilDue) {
        Map<String, Object> body = Map.of(
                "supplier_id",    supplierId,
                "invoice_amount", amount,
                "days_until_due", daysUntilDue
        );
        return post("/optimize/financing", body);
    }

    /**
     * POST /calculate/shapley
     * Returns Shapley value allocations for a multi-financier coalition.
     */
    public Map<String, Object> callShapleyCalculator(
            BigDecimal invoiceAmount, Double riskScore, List<Map<String, Object>> financiers) {
        Map<String, Object> body = Map.of(
                "invoice_amount",      invoiceAmount,
                "supplier_risk_score", riskScore,
                "financiers",          financiers
        );
        return post("/calculate/shapley", body);
    }

    // ── Internal helper ────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, Object> post(String path, Object body) {
        String url = baseUrl + path;
        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(url, body, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                log.debug("ML service {} returned OK", path);
                return response.getBody();
            }
            log.warn("ML service {} returned status {}", path, response.getStatusCode());
            return null;
        } catch (Exception e) {
            log.warn("ML service unavailable at {}: {}", url, e.getMessage());
            return null;
        }
    }
}
