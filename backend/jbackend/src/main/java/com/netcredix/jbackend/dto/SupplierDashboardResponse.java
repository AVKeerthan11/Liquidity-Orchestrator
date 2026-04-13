package com.netcredix.jbackend.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
public class SupplierDashboardResponse {
    private String companyName;
    private Double riskScore;
    private Severity riskSeverity;
    private long totalInvoices;
    private long pendingInvoices;
    private long overdueInvoices;
    private BigDecimal totalPendingAmount;
    private List<AlertResponse> activeAlerts;
    private List<FinancingOfferResponse> financingOffers;
    private List<InvoiceResponse> recentInvoices;
}
