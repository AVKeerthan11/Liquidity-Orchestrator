package com.netcredix.jbackend.service;

import com.netcredix.jbackend.dto.WhatIfRequest;
import com.netcredix.jbackend.dto.WhatIfResponse;
import com.netcredix.jbackend.model.Company;
import com.netcredix.jbackend.model.CompanyType;
import com.netcredix.jbackend.model.Invoice;
import com.netcredix.jbackend.model.InvoiceStatus;
import com.netcredix.jbackend.model.RiskScore;
import com.netcredix.jbackend.repository.CompanyRepository;
import com.netcredix.jbackend.repository.InvoiceRepository;
import com.netcredix.jbackend.repository.RiskScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class WhatIfService {

    private final InvoiceRepository   invoiceRepository;
    private final RiskScoreRepository riskScoreRepository;
    private final CompanyRepository   companyRepository;
    private final MLService           mlService;

    // ── Entry point ────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public WhatIfResponse simulate(WhatIfRequest request) {
        String scenario = request.resolvedScenario();
        if (scenario == null) {
            throw new IllegalArgumentException("scenario or scenarioType is required");
        }
        return switch (scenario) {
            case "SUPPLIER_FAILURE" -> simulateSupplierFailure(
                    resolveTarget(request), request.getRequestingCompanyId());
            case "PAYMENT_DELAY" -> simulatePaymentDelay(
                    resolveTarget(request),
                    request.getDelayDays() != null ? request.getDelayDays() : 30,
                    request.getRequestingCompanyId());
            default -> throw new IllegalArgumentException("Unknown scenario: " + scenario);
        };
    }

    private UUID resolveTarget(WhatIfRequest request) {
        if (request.getTargetCompanyId() != null) return request.getTargetCompanyId();
        if (request.getSupplierId()       != null) return request.getSupplierId();
        if (request.getBuyerId()          != null) return request.getBuyerId();
        throw new IllegalArgumentException("targetCompanyId is required");
    }

    // ── SUPPLIER_FAILURE ───────────────────────────────────────────────────────

    /**
     * Graph-based contagion propagation when a supplier fails.
     * Uses the FSRI contagion formula:
     *   P(i→j) = (Invoice_ij / TotalReceivables_j) × StressScore_i × supplyShare
     */
    private WhatIfResponse simulateSupplierFailure(UUID failedSupplierId, UUID requestingCompanyId) {

        // Step 1: All invoices from the failed supplier (eager-fetch)
        List<Invoice> supplierInvoices = invoiceRepository
                .findByCompanyIdWithCompanies(failedSupplierId)
                .stream()
                .filter(inv -> inv.getSupplier().getId().equals(failedSupplierId))
                .collect(Collectors.toList());

        // Step 2: Buyers this supplier supplies to
        List<UUID> affectedBuyerIds = supplierInvoices.stream()
                .map(inv -> inv.getBuyer().getId())
                .distinct()
                .collect(Collectors.toList());

        // Step 3: Direct exposure for the requesting company
        BigDecimal directExposure = BigDecimal.ZERO;
        if (requestingCompanyId != null) {
            directExposure = supplierInvoices.stream()
                    .filter(inv -> inv.getBuyer().getId().equals(requestingCompanyId))
                    .filter(inv -> inv.getStatus() == InvoiceStatus.PENDING
                                || inv.getStatus() == InvoiceStatus.OVERDUE)
                    .map(Invoice::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }

        // Step 4: Supply share of failed supplier per buyer
        Map<UUID, Double> buyerSupplyShare = new HashMap<>();
        for (UUID buyerId : affectedBuyerIds) {
            List<Invoice> allBuyerInvoices = invoiceRepository
                    .findByCompanyIdWithCompanies(buyerId)
                    .stream()
                    .filter(inv -> inv.getBuyer().getId().equals(buyerId))
                    .collect(Collectors.toList());

            BigDecimal totalBuyerInflow = allBuyerInvoices.stream()
                    .map(Invoice::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            BigDecimal thisSupplierShare = supplierInvoices.stream()
                    .filter(inv -> inv.getBuyer().getId().equals(buyerId))
                    .map(Invoice::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            double share = totalBuyerInflow.compareTo(BigDecimal.ZERO) > 0
                    ? thisSupplierShare.divide(totalBuyerInflow, 4, RoundingMode.HALF_UP).doubleValue()
                    : 0.0;
            buyerSupplyShare.put(buyerId, share);
        }

        // Step 5: Find other suppliers connected through the same buyers
        //         and calculate contagion probability per FSRI formula
        // Dynamic contagion multiplier based on failed supplier's risk score
        double failedRiskScore = riskScoreRepository
                .findFirstByCompanyIdOrderByCalculatedAtDesc(failedSupplierId)
                .map(RiskScore::getScore)
                .orElse(50.0);
        double contagionMultiplier = failedRiskScore >= 60 ? 0.4
                : failedRiskScore >= 40 ? 0.25 : 0.15;

        Map<UUID, WhatIfResponse.SupplierImpact> impactMap = new LinkedHashMap<>();

        for (UUID buyerId : affectedBuyerIds) {
            double supplyShare = buyerSupplyShare.getOrDefault(buyerId, 0.0);

            List<Invoice> buyerInvoices = invoiceRepository
                    .findByCompanyIdWithCompanies(buyerId)
                    .stream()
                    .filter(inv -> inv.getBuyer().getId().equals(buyerId))
                    .collect(Collectors.toList());

            Map<UUID, List<Invoice>> bySupplier = buyerInvoices.stream()
                    .filter(inv -> !inv.getSupplier().getId().equals(failedSupplierId))
                    .collect(Collectors.groupingBy(inv -> inv.getSupplier().getId()));

            for (Map.Entry<UUID, List<Invoice>> entry : bySupplier.entrySet()) {
                UUID affectedSupplierId = entry.getKey();
                List<Invoice> theirInvoices = entry.getValue();

                // Fix 2: Skip test companies with fewer than 3 invoices
                if (invoiceRepository.countBySupplierId(affectedSupplierId) < 3) continue;

                Company company = companyRepository.findById(affectedSupplierId).orElse(null);
                if (company == null) continue;

                double currentRisk = latestScore(affectedSupplierId);

                BigDecimal theirReceivables = theirInvoices.stream()
                        .map(Invoice::getAmount)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);

                BigDecimal totalReceivables = invoiceRepository
                        .findByCompanyIdWithCompanies(affectedSupplierId)
                        .stream()
                        .filter(inv -> inv.getSupplier().getId().equals(affectedSupplierId))
                        .map(Invoice::getAmount)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);

                // P(i→j) = (Invoice_ij / TotalReceivables_j) × StressScore_i × supplyShare
                double dependencyRatio = totalReceivables.compareTo(BigDecimal.ZERO) > 0
                        ? theirReceivables.divide(totalReceivables, 4, RoundingMode.HALF_UP).doubleValue()
                        : 0.0;

                double contagionProbability = dependencyRatio * 1.0 * supplyShare;
                // Fix 3: Apply dynamic contagion multiplier based on failed supplier's risk
                double riskIncrease  = round(contagionProbability * (100.0 - currentRisk) * contagionMultiplier);
                double projectedRisk = Math.min(100.0, round(currentRisk + riskIncrease));

                if (riskIncrease < 0.5) continue;

                // Fix 3: More aggressive severity thresholds
                String severity = projectedRisk >= 60 ? "HIGH"
                        : projectedRisk >= 35 ? "MEDIUM" : "LOW";

                WhatIfResponse.SupplierImpact impact = WhatIfResponse.SupplierImpact.builder()
                        .supplierId(affectedSupplierId)
                        .supplierName(company.getName())
                        .currentScore(round(currentRisk))
                        .projectedScore(projectedRisk)
                        .wouldFail(projectedRisk > 60.0)
                        .pendingAmount(round(theirReceivables.doubleValue()))
                        .build();

                // Deduplicate — keep highest risk increase per supplier
                impactMap.merge(affectedSupplierId, impact,
                        (a, b) -> (b.getProjectedScore() - b.getCurrentScore()) > (a.getProjectedScore() - a.getCurrentScore()) ? b : a);
            }
        }

        List<WhatIfResponse.SupplierImpact> sortedImpacts = impactMap.values().stream()
                .sorted(Comparator.comparingDouble(WhatIfResponse.SupplierImpact::getProjectedScore).reversed())
                .limit(10)
                .collect(Collectors.toList());

        int criticalCount = (int) sortedImpacts.stream().filter(WhatIfResponse.SupplierImpact::getWouldFail).count();
        double r0 = estimateR0(sortedImpacts, requestingCompanyId);
        String cascadeRisk = cascadeRisk(r0, criticalCount, sortedImpacts.size());

        double resilience = valueBasedResilience(sortedImpacts, failedSupplierId);

        String failedName = companyRepository.findById(failedSupplierId)
                .map(Company::getName).orElse("Unknown");
        double failedScore = latestScore(failedSupplierId);
        double exposureCrore = directExposure.divide(BigDecimal.valueOf(10_000_000), 2, RoundingMode.HALF_UP).doubleValue();

        Double riskScoreIncrease = null;
        if (requestingCompanyId != null) {
            Company requester = companyRepository.findById(requestingCompanyId).orElse(null);
            if (requester != null && requester.getType() == CompanyType.SUPPLIER) {
                double currentRisk = latestScore(requestingCompanyId);
                riskScoreIncrease = round(Math.min(100.0, currentRisk + 25.0) - currentRisk);
            }
        }

        return WhatIfResponse.builder()
                .scenarioType("SUPPLIER_FAILURE")
                .buyerId(requestingCompanyId)
                .delayDays(null)
                .affectedSuppliers(sortedImpacts.size())
                .criticalSuppliers(criticalCount)
                .totalFinancialImpact(directExposure.doubleValue())
                .totalFinancialExposure(directExposure.doubleValue())
                .riskScoreIncrease(riskScoreIncrease)
                .cascadeRisk(cascadeRisk)
                .cascadeDepth(sortedImpacts.size())
                .r0AfterScenario(round(r0))
                .networkResilienceScore(round(resilience))
                .supplierDetails(sortedImpacts)
                .recommendation(generateRecommendation("SUPPLIER_FAILURE", failedName, failedScore,
                        sortedImpacts.size(), exposureCrore))
                .build();
    }

    // ── PAYMENT_DELAY ──────────────────────────────────────────────────────────

    /**
     * Models cash flow impact when a buyer delays payment to the requesting supplier.
     * When called from supplier dashboard: requestingCompanyId=supplier, targetCompanyId=buyer.
     */
    private WhatIfResponse simulatePaymentDelay(UUID targetCompanyId, int delayDays, UUID requestingCompanyId) {

        // Step 1: Fetch invoices — supplier=targetCompanyId, buyer=requestingCompanyId
        // (buyer is running the simulation, targetCompanyId is the supplier being delayed)
        List<Invoice> relevantInvoices = requestingCompanyId != null
                ? invoiceRepository.findBySupplierIdAndBuyerId(targetCompanyId, requestingCompanyId)
                : Collections.emptyList();

        // Step 2: Already overdue = buyer is already late on these
        BigDecimal alreadyOverdue = relevantInvoices.stream()
                .filter(inv -> inv.getStatus() == InvoiceStatus.OVERDUE)
                .map(Invoice::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Step 3: Pending invoices that will become at risk due to the delay
        BigDecimal pendingAtRisk = relevantInvoices.stream()
                .filter(inv -> inv.getStatus() == InvoiceStatus.PENDING)
                .map(Invoice::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Step 4: Total at risk + interest cost of delay at 18% p.a.
        BigDecimal totalAtRisk = alreadyOverdue.add(pendingAtRisk);
        BigDecimal interestCost = totalAtRisk
                .multiply(BigDecimal.valueOf(delayDays))
                .divide(BigDecimal.valueOf(365), 2, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(0.18));
        BigDecimal totalExposure = totalAtRisk.add(interestCost);

        // If nothing outstanding, estimate 30% of total invoice volume as proxy
        if (totalExposure.compareTo(BigDecimal.ZERO) == 0) {
            BigDecimal totalVolume = relevantInvoices.stream()
                    .map(Invoice::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            totalExposure = totalVolume.multiply(BigDecimal.valueOf(0.30));
        }

        // Step 5: Risk score increase — based on requesting supplier's own risk + at-risk ratio
        // When called from buyer dashboard:
        //   requestingCompanyId = the buyer (e.g. Reliance)
        //   targetCompanyId     = the selected supplier (e.g. Patel Engineering Works)
        // supplierIdForRisk is always the selected supplier (targetCompanyId)
        UUID supplierIdForRisk = targetCompanyId;
        double currentRisk = latestScore(supplierIdForRisk);

        // Proportion of THIS supplier's invoices with THIS buyer that are at risk
        // This must be specific to the selected supplier so different suppliers give different results
        BigDecimal supplierTotalReceivables = invoiceRepository
                .findByCompanyIdWithCompanies(supplierIdForRisk)
                .stream()
                .filter(inv -> inv.getSupplier().getId().equals(supplierIdForRisk))
                .filter(inv -> inv.getStatus() == InvoiceStatus.OVERDUE
                            || inv.getStatus() == InvoiceStatus.PENDING)
                .map(Invoice::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        double atRiskRatio = supplierTotalReceivables.compareTo(BigDecimal.ZERO) > 0
                ? totalAtRisk.divide(supplierTotalReceivables, 4, RoundingMode.HALF_UP).doubleValue()
                : (totalAtRisk.compareTo(BigDecimal.ZERO) > 0 ? 0.3 : 0.05);

        double delayFactor = delayDays / 90.0;
        double riskIncrease  = round(Math.min(atRiskRatio, 1.0) * delayFactor * 20.0);
        double projectedRisk = Math.min(100.0, currentRisk + riskIncrease);

        // Step 6: Other suppliers of the same buyer — indirectly impacted
        // stressedBuyerId is always the buyer (requestingCompanyId from buyer dashboard)
        UUID buyerId = requestingCompanyId != null ? requestingCompanyId : targetCompanyId;
        UUID stressedBuyerId = requestingCompanyId != null ? requestingCompanyId : targetCompanyId;

        List<Invoice> allBuyerInvoices = invoiceRepository
                .findByCompanyIdWithCompanies(stressedBuyerId)
                .stream()
                .filter(inv -> inv.getBuyer().getId().equals(stressedBuyerId))
                .collect(Collectors.toList());

        List<WhatIfResponse.SupplierImpact> impacts = new ArrayList<>();
        Map<UUID, List<Invoice>> bySupplier = allBuyerInvoices.stream()
                .filter(inv -> !inv.getSupplier().getId().equals(supplierIdForRisk))
                .collect(Collectors.groupingBy(inv -> inv.getSupplier().getId()));

        double stressFactor = Math.min(1.0, atRiskRatio * delayFactor);

        for (Map.Entry<UUID, List<Invoice>> entry : bySupplier.entrySet()) {
            UUID supplierId = entry.getKey();
            List<Invoice> theirInvoices = entry.getValue();

            if (invoiceRepository.countBySupplierId(supplierId) < 3) continue;

            Company company = companyRepository.findById(supplierId).orElse(null);
            if (company == null) continue;

            double supplierCurrentRisk = latestScore(supplierId);

            BigDecimal theirBuyerInvoices = theirInvoices.stream()
                    .map(Invoice::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            BigDecimal theirTotalInvoices = invoiceRepository
                    .findByCompanyIdWithCompanies(supplierId)
                    .stream()
                    .filter(inv -> inv.getSupplier().getId().equals(supplierId))
                    .map(Invoice::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            double buyerDependency = theirTotalInvoices.compareTo(BigDecimal.ZERO) > 0
                    ? theirBuyerInvoices.divide(theirTotalInvoices, 4, RoundingMode.HALF_UP).doubleValue()
                    : 0.0;

            double vulnerabilityFactor = supplierCurrentRisk / 100.0;
            // stressFactor is derived from the selected supplier's at-risk ratio
            // so different suppliers produce different downstream impact magnitudes
            double indirectRiskIncrease = round(
                    stressFactor * buyerDependency * (1.0 + vulnerabilityFactor) * 30.0);
            // Do NOT apply a minimum floor — let low-stress suppliers show near-zero impact
            // Only include this supplier in results if impact is meaningful
            if (indirectRiskIncrease < 0.3) continue;

            double supplierProjectedRisk = Math.min(100.0, supplierCurrentRisk + indirectRiskIncrease);

            BigDecimal pendingAmt = theirInvoices.stream()
                    .filter(inv -> inv.getStatus() == InvoiceStatus.PENDING
                                || inv.getStatus() == InvoiceStatus.OVERDUE)
                    .map(Invoice::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            impacts.add(WhatIfResponse.SupplierImpact.builder()
                    .supplierId(supplierId)
                    .supplierName(company.getName())
                    .currentScore(round(supplierCurrentRisk))
                    .projectedScore(round(supplierProjectedRisk))
                    .wouldFail(supplierProjectedRisk > 60.0)
                    .pendingAmount(round(pendingAmt.doubleValue()))
                    .build());
        }

        impacts.sort(Comparator.comparingDouble(WhatIfResponse.SupplierImpact::getProjectedScore).reversed());
        List<WhatIfResponse.SupplierImpact> topImpacts = impacts.stream().limit(10).collect(Collectors.toList());

        int criticalCount = (int) topImpacts.stream().filter(WhatIfResponse.SupplierImpact::getWouldFail).count();
        double r0 = estimateR0(topImpacts, targetCompanyId);
        String cascadeRisk = cascadeRisk(r0, criticalCount, topImpacts.size());

        double resilience = valueBasedResilience(topImpacts, supplierIdForRisk);

        // Buyer name for recommendation
        String buyerName = companyRepository.findById(targetCompanyId)
                .map(Company::getName).orElse("your buyer");
        double exposureCrore = totalExposure.divide(BigDecimal.valueOf(10_000_000), 2, RoundingMode.HALF_UP).doubleValue();

        String recommendation = String.format(
                "If %s delays payment by %d days, ₹%.2f Cr of your receivables are at risk. " +
                "Consider applying for invoice discounting now to bridge the gap.",
                buyerName, delayDays, exposureCrore);

        return WhatIfResponse.builder()
                .scenarioType("PAYMENT_DELAY")
                .buyerId(buyerId)
                .delayDays(delayDays)
                .affectedSuppliers(topImpacts.size())
                .criticalSuppliers(criticalCount)
                .totalFinancialImpact(totalExposure.doubleValue())
                .totalFinancialExposure(totalExposure.doubleValue())
                .riskScoreIncrease(riskIncrease)
                .cascadeRisk(cascadeRisk)
                .cascadeDepth(topImpacts.size())
                .r0AfterScenario(round(r0))
                .networkResilienceScore(round(resilience))
                .supplierDetails(topImpacts)
                .recommendation(recommendation)
                .build();
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private double latestScore(UUID companyId) {
        return riskScoreRepository
                .findFirstByCompanyIdOrderByCalculatedAtDesc(companyId)
                .map(RiskScore::getScore)
                .orElse(10.0);
    }

    private double estimateR0(List<WhatIfResponse.SupplierImpact> impacts, UUID contextId) {
        if (impacts.isEmpty()) return 0.0;
        try {
            List<String> ids = new ArrayList<>(
                    impacts.stream().map(i -> i.getSupplierId().toString()).toList());
            if (contextId != null) ids.add(contextId.toString());
            Map<String, Object> result = mlService.callContagionSimulation(ids);
            if (result != null && result.containsKey("r0")) {
                return ((Number) result.get("r0")).doubleValue();
            }
        } catch (Exception e) {
            log.warn("ML contagion call failed, using local R0 estimate: {}", e.getMessage());
        }
        long infected = impacts.stream().filter(WhatIfResponse.SupplierImpact::getWouldFail).count();
        return ((double) infected / impacts.size()) * 2.5;
    }

    private String cascadeRisk(double r0, int criticalCount, int total) {
        if (r0 > 2.0 || (total > 0 && criticalCount > total * 0.5)) return "CRITICAL";
        if (r0 > 1.5 || (total > 0 && criticalCount > total * 0.3)) return "HIGH";
        if (r0 > 1.0 || criticalCount > 0)                           return "MEDIUM";
        return "LOW";
    }

    private String generateRecommendation(String scenario, String companyName,
            double riskScore, int impactedCount, double exposureCrore) {
        if ("SUPPLIER_FAILURE".equals(scenario)) {
            if (riskScore >= 60) {
                return String.format(
                    "CRITICAL: If %s fails, your supply chain exposure is ₹%.2f Cr across %d connected suppliers. " +
                    "Activate a backup supplier and arrange emergency financing immediately.",
                    companyName, exposureCrore, impactedCount);
            } else if (riskScore >= 40) {
                return String.format(
                    "WARNING: If %s fails, your supply chain exposure is ₹%.2f Cr. " +
                    "Prepare contingency financing for %d potentially impacted suppliers.",
                    companyName, exposureCrore, impactedCount);
            } else {
                return String.format(
                    "If %s fails, your supply chain exposure is ₹%.2f Cr. " +
                    "Risk is currently low — monitor %d connected suppliers weekly.",
                    companyName, exposureCrore, impactedCount);
            }
        } else {
            if (exposureCrore > 0) {
                return String.format(
                    "If %s delays payment, ₹%.2f Cr of your receivables are at risk. " +
                    "Consider applying for invoice discounting now to bridge the gap.",
                    companyName, exposureCrore);
            } else if (impactedCount >= 4) {
                return String.format(
                    "HIGH IMPACT: Delaying payment to %s affects %d connected suppliers. " +
                    "Consider early payment or invoice discounting to prevent cascade.",
                    companyName, impactedCount);
            } else {
                return String.format(
                    "MODERATE IMPACT: Delaying payment to %s affects %d suppliers. " +
                    "Consider invoice discounting or early payment to prevent further spread.",
                    companyName, impactedCount);
            }
        }
    }

    private double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    /**
     * Value-based network resilience: 1 - (impacted invoice value / total network value).
     * More accurate than count-based because it weights by financial significance.
     */
    private double valueBasedResilience(List<WhatIfResponse.SupplierImpact> impacted, UUID targetCompanyId) {
        BigDecimal totalNetworkValue = invoiceRepository.findAll()
                .stream()
                .map(Invoice::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        if (totalNetworkValue.compareTo(BigDecimal.ZERO) == 0) return 1.0;

        // Sum invoice value of all impacted suppliers
        BigDecimal impactedValue = BigDecimal.ZERO;
        for (WhatIfResponse.SupplierImpact imp : impacted) {
            BigDecimal companyValue = invoiceRepository
                    .findByCompanyIdWithCompanies(imp.getSupplierId())
                    .stream()
                    .filter(inv -> inv.getSupplier().getId().equals(imp.getSupplierId()))
                    .map(Invoice::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            impactedValue = impactedValue.add(companyValue);
        }

        // Also include the failed/delayed supplier's own value
        if (targetCompanyId != null) {
            BigDecimal targetValue = invoiceRepository
                    .findByCompanyIdWithCompanies(targetCompanyId)
                    .stream()
                    .filter(inv -> inv.getSupplier().getId().equals(targetCompanyId))
                    .map(Invoice::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            impactedValue = impactedValue.add(targetValue);
        }

        double resilience = 1.0 - impactedValue
                .divide(totalNetworkValue, 4, RoundingMode.HALF_UP)
                .doubleValue();
        return Math.max(0.0, Math.min(1.0, resilience));
    }

    /** Returns distinct suppliers that have invoices with the given buyer (for dropdown). */
    public List<Map<String, String>> getSuppliersForBuyer(UUID buyerId) {
        return invoiceRepository.findByBuyerIdWithSupplier(buyerId).stream()
                .map(Invoice::getSupplier)
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(
                        c -> c.getId().toString(),
                        Company::getName,
                        (a, b) -> a,
                        LinkedHashMap::new
                ))
                .entrySet().stream()
                .map(e -> {
                    Map<String, String> m = new LinkedHashMap<>();
                    m.put("id", e.getKey());
                    m.put("name", e.getValue());
                    return m;
                })
                .collect(Collectors.toList());
    }
}
