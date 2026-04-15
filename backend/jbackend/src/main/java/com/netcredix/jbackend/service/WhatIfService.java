package com.netcredix.jbackend.service;

import com.netcredix.jbackend.dto.WhatIfRequest;
import com.netcredix.jbackend.dto.WhatIfResponse;
import com.netcredix.jbackend.model.Invoice;
import com.netcredix.jbackend.model.InvoiceStatus;
import com.netcredix.jbackend.model.RiskScore;
import com.netcredix.jbackend.repository.InvoiceRepository;
import com.netcredix.jbackend.repository.RiskScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class WhatIfService {

    private static final double CRITICAL_THRESHOLD = 60.0;
    private static final double TRANSMISSION_RATE  = 2.5;

    private final InvoiceRepository   invoiceRepository;
    private final RiskScoreRepository riskScoreRepository;
    private final MLService           mlService;

    @Transactional(readOnly = true)
    public WhatIfResponse simulate(WhatIfRequest request) {
        return switch (request.getScenarioType().toUpperCase()) {
            case "PAYMENT_DELAY"    -> simulatePaymentDelay(request);
            case "SUPPLIER_FAILURE" -> simulateSupplierFailure(request);
            default -> throw new IllegalArgumentException(
                    "Unknown scenarioType: " + request.getScenarioType());
        };
    }

    // ── PAYMENT_DELAY ──────────────────────────────────────────────────────────

    private WhatIfResponse simulatePaymentDelay(WhatIfRequest request) {
        int delayDays = request.getDelayDays() != null ? request.getDelayDays() : 30;

        // Use eager-fetch query to avoid LazyInitializationException on supplier/buyer
        List<Invoice> buyerInvoices = invoiceRepository
                .findByCompanyIdWithCompanies(request.getBuyerId());

        Map<UUID, List<Invoice>> pendingBySupplier = buyerInvoices.stream()
                .filter(i -> i.getBuyer().getId().equals(request.getBuyerId()))
                .filter(i -> i.getStatus() == InvoiceStatus.PENDING)
                .collect(Collectors.groupingBy(i -> i.getSupplier().getId()));

        List<WhatIfResponse.SupplierImpact> impacts = new ArrayList<>();
        double totalImpact = 0.0;

        for (Map.Entry<UUID, List<Invoice>> entry : pendingBySupplier.entrySet()) {
            UUID supplierId   = entry.getKey();
            List<Invoice> invoices = entry.getValue();

            String supplierName = invoices.get(0).getSupplier().getName();
            double pendingAmount = invoices.stream()
                    .map(Invoice::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add)
                    .doubleValue();

            double currentScore   = latestScore(supplierId);
            double projectedScore = Math.min(currentScore + (delayDays * 0.5), 100.0);
            boolean wouldFail     = projectedScore > CRITICAL_THRESHOLD;

            if (wouldFail) totalImpact += pendingAmount;

            impacts.add(WhatIfResponse.SupplierImpact.builder()
                    .supplierId(supplierId)
                    .supplierName(supplierName)
                    .currentScore(round(currentScore))
                    .projectedScore(round(projectedScore))
                    .wouldFail(wouldFail)
                    .pendingAmount(round(pendingAmount))
                    .build());
        }

        impacts.sort(Comparator.comparingDouble(WhatIfResponse.SupplierImpact::getProjectedScore).reversed());

        int criticalCount = (int) impacts.stream().filter(WhatIfResponse.SupplierImpact::getWouldFail).count();
        double r0         = calculateProjectedR0(impacts, request.getBuyerId());
        String cascadeRisk = cascadeRisk(r0, criticalCount, impacts.size());

        return WhatIfResponse.builder()
                .scenarioType("PAYMENT_DELAY")
                .buyerId(request.getBuyerId())
                .delayDays(delayDays)
                .affectedSuppliers(impacts.size())
                .criticalSuppliers(criticalCount)
                .totalFinancialImpact(round(totalImpact))
                .cascadeRisk(cascadeRisk)
                .r0AfterScenario(round(r0))
                .supplierDetails(impacts)
                .recommendation(buildRecommendation("PAYMENT_DELAY", criticalCount, r0, delayDays))
                .build();
    }

    // ── SUPPLIER_FAILURE ───────────────────────────────────────────────────────

    private WhatIfResponse simulateSupplierFailure(WhatIfRequest request) {
        if (request.getSupplierId() == null) {
            throw new IllegalArgumentException("supplierId is required for SUPPLIER_FAILURE scenario");
        }

        UUID failedSupplierId = request.getSupplierId();

        List<Invoice> buyerInvoices = invoiceRepository
                .findByCompanyIdWithCompanies(request.getBuyerId());

        // Filter to only invoices where this company is the buyer
        List<Invoice> asBuyer = buyerInvoices.stream()
                .filter(i -> i.getBuyer().getId().equals(request.getBuyerId()))
                .toList();

        double failedSupplierExposure = asBuyer.stream()
                .filter(i -> i.getSupplier().getId().equals(failedSupplierId))
                .filter(i -> i.getStatus() == InvoiceStatus.PENDING)
                .map(Invoice::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .doubleValue();

        Map<UUID, List<Invoice>> pendingBySupplier = asBuyer.stream()
                .filter(i -> i.getStatus() == InvoiceStatus.PENDING)
                .filter(i -> !i.getSupplier().getId().equals(failedSupplierId))
                .collect(Collectors.groupingBy(i -> i.getSupplier().getId()));

        List<WhatIfResponse.SupplierImpact> impacts = new ArrayList<>();
        double totalImpact = failedSupplierExposure;

        for (Map.Entry<UUID, List<Invoice>> entry : pendingBySupplier.entrySet()) {
            UUID supplierId   = entry.getKey();
            List<Invoice> invoices = entry.getValue();

            String supplierName = invoices.get(0).getSupplier().getName();
            double pendingAmount = invoices.stream()
                    .map(Invoice::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add)
                    .doubleValue();

            double currentScore   = latestScore(supplierId);
            double projectedScore = Math.min(currentScore + 15.0, 100.0);
            boolean wouldFail     = projectedScore > CRITICAL_THRESHOLD;

            if (wouldFail) totalImpact += pendingAmount;

            impacts.add(WhatIfResponse.SupplierImpact.builder()
                    .supplierId(supplierId)
                    .supplierName(supplierName)
                    .currentScore(round(currentScore))
                    .projectedScore(round(projectedScore))
                    .wouldFail(wouldFail)
                    .pendingAmount(round(pendingAmount))
                    .build());
        }

        impacts.sort(Comparator.comparingDouble(WhatIfResponse.SupplierImpact::getProjectedScore).reversed());

        int criticalCount  = (int) impacts.stream().filter(WhatIfResponse.SupplierImpact::getWouldFail).count();
        double r0          = calculateProjectedR0(impacts, request.getBuyerId());
        String cascadeRisk = cascadeRisk(r0, criticalCount, impacts.size());

        return WhatIfResponse.builder()
                .scenarioType("SUPPLIER_FAILURE")
                .buyerId(request.getBuyerId())
                .delayDays(null)
                .affectedSuppliers(impacts.size())
                .criticalSuppliers(criticalCount)
                .totalFinancialImpact(round(totalImpact))
                .cascadeRisk(cascadeRisk)
                .r0AfterScenario(round(r0))
                .supplierDetails(impacts)
                .recommendation(buildRecommendation("SUPPLIER_FAILURE", criticalCount, r0, 0))
                .build();
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private double latestScore(UUID companyId) {
        return riskScoreRepository
                .findFirstByCompanyIdOrderByCalculatedAtDesc(companyId)
                .map(RiskScore::getScore)
                .orElse(0.0);
    }

    private double calculateProjectedR0(List<WhatIfResponse.SupplierImpact> impacts, UUID buyerId) {
        if (impacts.isEmpty()) return 0.0;
        try {
            List<String> ids = new ArrayList<>(
                    impacts.stream().map(i -> i.getSupplierId().toString()).toList()
            );
            ids.add(buyerId.toString());
            Map<String, Object> result = mlService.callContagionSimulation(ids);
            if (result != null && result.containsKey("r0")) {
                return ((Number) result.get("r0")).doubleValue();
            }
        } catch (Exception e) {
            log.warn("ML contagion call failed, using local R0 estimate: {}", e.getMessage());
        }
        long infected = impacts.stream().filter(WhatIfResponse.SupplierImpact::getWouldFail).count();
        return ((double) infected / impacts.size()) * TRANSMISSION_RATE;
    }

    private String cascadeRisk(double r0, int criticalCount, int totalSuppliers) {
        if (r0 > 2.0 || criticalCount > totalSuppliers * 0.5) return "CRITICAL";
        if (r0 > 1.5 || criticalCount > totalSuppliers * 0.3) return "HIGH";
        if (r0 > 1.0 || criticalCount > 0)                    return "MEDIUM";
        return "LOW";
    }

    private String buildRecommendation(String type, int criticalCount, double r0, int delayDays) {
        if (criticalCount == 0) {
            return "No immediate intervention required. Monitor supplier health scores.";
        }
        if ("PAYMENT_DELAY".equals(type)) {
            return String.format(
                "Pre-emptively offer early payment to %d critical supplier%s to prevent cascade. " +
                "A %d-day delay pushes R0 to %.1f — %s.",
                criticalCount, criticalCount > 1 ? "s" : "",
                delayDays, r0,
                r0 > 2.0 ? "immediate action required" : "intervention recommended"
            );
        }
        return String.format(
            "Activate contingency financing for %d at-risk supplier%s. " +
            "R0 of %.1f indicates %s contagion risk.",
            criticalCount, criticalCount > 1 ? "s" : "",
            r0, r0 > 2.0 ? "critical" : "elevated"
        );
    }

    private double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
