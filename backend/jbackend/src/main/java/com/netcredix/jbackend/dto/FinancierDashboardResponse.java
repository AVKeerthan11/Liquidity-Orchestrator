package com.netcredix.jbackend.dto;

import com.netcredix.jbackend.model.FinancingType;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Data
@Builder
public class FinancierDashboardResponse {
    private long totalOpportunities;
    private List<FinancingOfferResponse> activeOffers;
    private BigDecimal totalPortfolioValue;
    private Double averageRiskScore;
    private Map<FinancingType, Long> offersByType;
}
