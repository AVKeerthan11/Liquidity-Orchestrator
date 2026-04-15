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
    private Double  r0AfterScenario;

    private List<SupplierImpact> supplierDetails;
    private String recommendation;

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
