package com.netcredix.jbackend.service;

import com.netcredix.jbackend.dto.*;
import com.netcredix.jbackend.model.*;
import com.netcredix.jbackend.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DashboardService {

    private final CompanyRepository companyRepository;
    private final InvoiceRepository invoiceRepository;
    private final RiskScoreRepository riskScoreRepository;
    private final AlertRepository alertRepository;
    private final FinancingOfferRepository financingOfferRepository;
    private final GraphService graphService;

    @Transactional
    public SupplierDashboardResponse getSupplierDashboard(UUID companyId) {
        Company company = companyRepository.findById(companyId)
                .orElseThrow(() -> new IllegalArgumentException("Supplier not found"));

        long totalInvoices = invoiceRepository.countBySupplierId(companyId);
        long pendingInvoices = invoiceRepository.countBySupplierIdAndStatus(companyId, InvoiceStatus.PENDING);
        long overdueInvoices = invoiceRepository.countBySupplierIdAndStatus(companyId, InvoiceStatus.OVERDUE);

        List<Invoice> pendingList = invoiceRepository.findBySupplierIdAndStatusIn(companyId, List.of(InvoiceStatus.PENDING));
        BigDecimal totalPendingAmount = pendingList.stream()
                .map(Invoice::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Invoice> recent = invoiceRepository.findTop5BySupplierIdOrderByCreatedAtDesc(companyId);
        List<InvoiceResponse> recentInvoices = recent.stream().map(this::toInvoiceResponse).toList();

        RiskScore latestScore = riskScoreRepository.findFirstByCompanyIdOrderByCalculatedAtDesc(companyId).orElse(null);
        Double scoreValue = latestScore != null ? latestScore.getScore() : 0.0;
        Severity severity = calculateSeverity(scoreValue);

        List<Alert> alerts = alertRepository.findByCompanyIdOrderBySeverityDesc(companyId);
        List<AlertResponse> activeAlerts = alerts.stream().map(this::toAlertResponse).toList();

        List<FinancingOffer> offers = financingOfferRepository.findBySupplierId(companyId);
        List<FinancingOfferResponse> financingOffers = offers.stream().map(this::toFinancingOfferResponse).toList();

        return SupplierDashboardResponse.builder()
                .companyName(company.getName())
                .riskScore(scoreValue)
                .riskSeverity(severity)
                .totalInvoices(totalInvoices)
                .pendingInvoices(pendingInvoices)
                .overdueInvoices(overdueInvoices)
                .totalPendingAmount(totalPendingAmount)
                .activeAlerts(activeAlerts)
                .financingOffers(financingOffers)
                .recentInvoices(recentInvoices)
                .build();
    }

    @Transactional
    public BuyerDashboardResponse getBuyerDashboard(UUID companyId) {
        Company company = companyRepository.findById(companyId)
                .orElseThrow(() -> new IllegalArgumentException("Buyer not found"));

        List<Invoice> buyerInvoices = invoiceRepository.findByBuyerId(companyId);

        Set<UUID> supplierIds = buyerInvoices.stream()
                .map(i -> i.getSupplier().getId())
                .collect(Collectors.toSet());

        long totalSuppliers = supplierIds.size();

        long atRiskSuppliers = 0;
        Double totalScore = 0.0;
        int suppliersWithScore = 0;
        List<AlertResponse> criticalAlerts = new ArrayList<>();

        for (UUID sid : supplierIds) {
            RiskScore rs = riskScoreRepository.findFirstByCompanyIdOrderByCalculatedAtDesc(sid).orElse(null);
            if (rs != null) {
                totalScore += rs.getScore();
                suppliersWithScore++;
                if (rs.getScore() > 60.0) {
                    atRiskSuppliers++;
                }
            }
            List<Alert> salerts = alertRepository.findByCompanyIdOrderBySeverityDesc(sid);
            for (Alert a : salerts) {
                if (a.getSeverity() == AlertSeverity.CRITICAL) {
                    criticalAlerts.add(toAlertResponse(a));
                }
            }
        }

        Double supplyChainHealthScore = suppliersWithScore > 0 ? totalScore / suppliersWithScore : 0.0;

        BigDecimal totalOutstandingPayables = buyerInvoices.stream()
                .filter(i -> i.getStatus() == InvoiceStatus.PENDING)
                .map(Invoice::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        CytoscapeResponse supplierNetwork = graphService.getNetworkForCompany(companyId.toString());

        return BuyerDashboardResponse.builder()
                .companyName(company.getName())
                .supplyChainHealthScore(supplyChainHealthScore)
                .totalSuppliers(totalSuppliers)
                .atRiskSuppliers(atRiskSuppliers)
                .totalOutstandingPayables(totalOutstandingPayables)
                .criticalAlerts(criticalAlerts)
                .supplierNetwork(supplierNetwork)
                .build();
    }

    @Transactional
    public FinancierDashboardResponse getFinancierDashboard() {
        List<RiskScore> latestScores = riskScoreRepository.findAllLatestRiskScores();
        long totalOpportunities = 0;
        Double sumScore = 0.0;
        for (RiskScore rs : latestScores) {
            sumScore += rs.getScore();
            if (rs.getScore() > 60.0) {
                totalOpportunities++;
            }
        }
        Double averageRiskScore = latestScores.isEmpty() ? 0.0 : sumScore / latestScores.size();

        List<FinancingOffer> activeOfferModels = financingOfferRepository.findByStatus(FinancingStatus.PENDING);
        List<FinancingOfferResponse> activeOffers = activeOfferModels.stream()
                .map(this::toFinancingOfferResponse)
                .toList();

        BigDecimal totalPortfolioValue = activeOfferModels.stream()
                .map(FinancingOffer::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<FinancingType, Long> offersByType = activeOfferModels.stream()
                .collect(Collectors.groupingBy(FinancingOffer::getType, Collectors.counting()));

        return FinancierDashboardResponse.builder()
                .totalOpportunities(totalOpportunities)
                .activeOffers(activeOffers)
                .totalPortfolioValue(totalPortfolioValue)
                .averageRiskScore(averageRiskScore)
                .offersByType(offersByType)
                .build();
    }

    private Severity calculateSeverity(Double score) {
        if (score > 60.0) return Severity.RED;
        if (score > 30.0) return Severity.YELLOW;
        return Severity.GREEN;
    }

    private InvoiceResponse toInvoiceResponse(Invoice invoice) {
        return InvoiceResponse.builder()
                .id(invoice.getId())
                .supplierId(invoice.getSupplier().getId())
                .supplierName(invoice.getSupplier().getName())
                .buyerId(invoice.getBuyer().getId())
                .buyerName(invoice.getBuyer().getName())
                .amount(invoice.getAmount())
                .dueDate(invoice.getDueDate())
                .status(invoice.getStatus())
                .createdAt(invoice.getCreatedAt())
                .build();
    }

    private AlertResponse toAlertResponse(Alert alert) {
        return AlertResponse.builder()
                .id(alert.getId())
                .companyId(alert.getCompany().getId())
                .message(alert.getMessage())
                .severity(alert.getSeverity())
                .createdAt(alert.getCreatedAt())
                .build();
    }

    private FinancingOfferResponse toFinancingOfferResponse(FinancingOffer offer) {
        return FinancingOfferResponse.builder()
                .id(offer.getId())
                .supplierId(offer.getSupplier().getId())
                .type(offer.getType())
                .amount(offer.getAmount())
                .cost(offer.getCost())
                .status(offer.getStatus())
                .createdAt(offer.getCreatedAt())
                .build();
    }
}
