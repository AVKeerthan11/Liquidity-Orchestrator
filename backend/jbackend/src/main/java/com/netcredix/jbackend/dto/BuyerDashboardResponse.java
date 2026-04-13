package com.netcredix.jbackend.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
public class BuyerDashboardResponse {
    private String companyName;
    private Double supplyChainHealthScore;
    private long totalSuppliers;
    private long atRiskSuppliers;
    private BigDecimal totalOutstandingPayables;
    private List<AlertResponse> criticalAlerts;
    private CytoscapeResponse supplierNetwork;
}
