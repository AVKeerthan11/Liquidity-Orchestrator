package com.netcredix.jbackend.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
@Builder
public class WhatIfResponse {

    private String scenarioType;
    private UUID   buyerId;
    private Integer delayDays;

    private Integer affectedSuppliers;
    private Integer criticalSuppliers;
    private Double  totalFinancialImpact;
    private String  cascadeRisk;          // LOW / MEDIUM / HIGH / CRITICAL
    private Integer cascadeDepth;         // count of impacted supplier tiers
    private Double  r0AfterScenario;
    private Double  networkResilienceScore; // 0.0–1.0 resilience of the network

    private List<SupplierImpact> supplierDetails;
    private String recommendation;

    // Supplier-perspective fields (populated when requestingCompanyId is a SUPPLIER)
    private Double totalFinancialExposure; // money at risk between requesting supplier and target buyer
    private Double riskScoreIncrease;      // projected risk score delta for the requesting supplier

    @Data
    @Builder
    public static class SupplierImpact {
        private UUID   supplierId;
        private String supplierName;
        private Double currentScore;
        private Double projectedScore;
        private Boolean wouldFail;
        private Double pendingAmount;
    }
}
