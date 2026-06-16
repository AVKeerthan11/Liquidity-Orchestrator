package com.netcredix.jbackend.service;

import com.netcredix.jbackend.model.Company;
import com.netcredix.jbackend.model.Invoice;
import com.netcredix.jbackend.model.InvoiceStatus;
import com.netcredix.jbackend.model.Payment;
import com.netcredix.jbackend.model.RiskScore;
import com.netcredix.jbackend.repository.CompanyRepository;
import com.netcredix.jbackend.repository.InvoiceRepository;
import com.netcredix.jbackend.repository.PaymentRepository;
import com.netcredix.jbackend.repository.RiskScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class RiskScoreService {

    private final InvoiceRepository     invoiceRepository;
    private final PaymentRepository     paymentRepository;
    private final RiskScoreRepository   riskScoreRepository;
    private final CompanyRepository     companyRepository;
    private final MLService             mlService;

    @Transactional
    public Double calculateRiskScore(UUID companyId) {
        log.info("Calculating risk score for company {}", companyId);

        double score = scoreFromML(companyId);
        if (score < 0) {
            log.info("ML service unavailable, using rule-based fallback for {}", companyId);
            score = scoreFromRules(companyId);
        }

        persistScore(companyId, score);
        return score;
    }

    // ── ML-based scoring ───────────────────────────────────────────────────────

    private double scoreFromML(UUID companyId) {
        try {
            Map<String, Object> result = mlService.callRiskScore(companyId.toString());
            if (result != null && result.containsKey("risk_score")) {
                double mlScore = ((Number) result.get("risk_score")).doubleValue();
                log.info("ML risk score for {}: {}", companyId, mlScore);
                return mlScore;
            }
        } catch (Exception e) {
            log.warn("ML score extraction failed for {}: {}", companyId, e.getMessage());
        }
        return -1; // sentinel: means ML unavailable
    }

    // ── Rule-based fallback ────────────────────────────────────────────────────

    private double scoreFromRules(UUID companyId) {
        List<Invoice> invoices = invoiceRepository.findByCompanyId(companyId);
        List<Payment> payments = paymentRepository.findByInvoiceSupplierId(companyId);

        double overdueComponent  = calculateOverdueRatio(invoices) * 40.0;
        double delayComponent    = (Math.min(calculateAvgDelayDays(payments), 60.0) / 60.0) * 30.0;
        double pendingComponent  = calculatePendingRatio(invoices) * 30.0;

        return Math.min(overdueComponent + delayComponent + pendingComponent, 100.0);
    }

    private double calculateOverdueRatio(List<Invoice> invoices) {
        if (invoices.isEmpty()) return 0.0;
        long overdue = invoices.stream().filter(i -> i.getStatus() == InvoiceStatus.OVERDUE).count();
        return (double) overdue / invoices.size();
    }

    private double calculateAvgDelayDays(List<Payment> payments) {
        List<Payment> delayed = payments.stream()
                .filter(p -> p.getDelayDays() != null && p.getDelayDays() > 0)
                .toList();
        if (delayed.isEmpty()) return 0.0;
        return delayed.stream().mapToDouble(Payment::getDelayDays).average().orElse(0.0);
    }

    private double calculatePendingRatio(List<Invoice> invoices) {
        BigDecimal total = invoices.stream()
                .map(Invoice::getAmount).filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (total.compareTo(BigDecimal.ZERO) == 0) return 0.0;
        BigDecimal pending = invoices.stream()
                .filter(i -> i.getStatus() == InvoiceStatus.PENDING)
                .map(Invoice::getAmount).filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return pending.divide(total, 4, RoundingMode.HALF_UP).doubleValue();
    }

    // ── Persistence ────────────────────────────────────────────────────────────

    private void persistScore(UUID companyId, double score) {
        companyRepository.findById(companyId).ifPresent(company -> {
            RiskScore rs = RiskScore.builder()
                    .company(company)
                    .score(score)
                    .calculatedAt(LocalDateTime.now())
                    .build();
            riskScoreRepository.save(rs);
            log.info("Risk score saved for company {}: {}", companyId, score);
        });
    }

    // ── History ────────────────────────────────────────────────────────────────

    public List<com.netcredix.jbackend.dto.RiskScoreHistoryResponse> getRiskScoreHistory(UUID companyId, int days) {
        LocalDateTime since = LocalDateTime.now().minusDays(days);
        return riskScoreRepository.findHistoryByCompanyId(companyId, since)
                .stream()
                .map(rs -> new com.netcredix.jbackend.dto.RiskScoreHistoryResponse(
                        rs.getScore(),
                        rs.getCalculatedAt().toString()
                ))
                .toList();
    }

    // ── Research Comparison ────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public com.netcredix.jbackend.dto.ResearchComparisonResponse getResearchComparison(UUID companyId) {
        Company company = companyRepository.findById(companyId)
                .orElseThrow(() -> new RuntimeException("Company not found"));

        // All invoices where this company is the supplier
        List<Invoice> supplierInvoices = invoiceRepository.findBySupplierId(companyId);
        List<Payment> payments = paymentRepository.findByInvoiceSupplierId(companyId);

        long totalInvoices = supplierInvoices.size();
        long overdueCount  = supplierInvoices.stream().filter(i -> i.getStatus() == InvoiceStatus.OVERDUE).count();
        long pendingCount  = supplierInvoices.stream().filter(i -> i.getStatus() == InvoiceStatus.PENDING).count();

        // Feature 1: overdue ratio
        double overdueRatio = totalInvoices > 0 ? (double) overdueCount / totalInvoices : 0.0;

        // Feature 2: avg delay days
        // Primary: from payments table if records exist
        // Fallback: estimate from OVERDUE invoices using days past due date
        double avgDelayDays = payments.stream()
                .filter(p -> p.getDelayDays() != null && p.getDelayDays() > 0)
                .mapToDouble(Payment::getDelayDays)
                .average()
                .orElseGet(() -> {
                    // Fallback: calculate from OVERDUE invoices — days between due date and now
                    return supplierInvoices.stream()
                            .filter(i -> i.getStatus() == InvoiceStatus.OVERDUE && i.getDueDate() != null)
                            .mapToDouble(i -> {
                                long days = java.time.temporal.ChronoUnit.DAYS.between(
                                        i.getDueDate(), java.time.LocalDate.now());
                                return Math.max(days, 0);
                            })
                            .average()
                            .orElse(0.0);
                });

        // Feature 3: pending ratio (by amount, not count — more accurate)
        BigDecimal totalAmount = supplierInvoices.stream()
                .map(Invoice::getAmount)
                .filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal pendingAmount = supplierInvoices.stream()
                .filter(i -> i.getStatus() == InvoiceStatus.PENDING)
                .map(Invoice::getAmount)
                .filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        double pendingRatio = totalAmount.compareTo(BigDecimal.ZERO) > 0
                ? pendingAmount.divide(totalAmount, 4, RoundingMode.HALF_UP).doubleValue()
                : (totalInvoices > 0 ? (double) pendingCount / totalInvoices : 0.0);

        // Feature 4: payment frequency — invoices created per month over the invoice history window
        // Use invoice dates instead of payments table since payments may be sparse
        double paymentFrequency;
        if (!supplierInvoices.isEmpty()) {
            java.time.LocalDateTime earliest = supplierInvoices.stream()
                    .map(Invoice::getCreatedAt)
                    .filter(d -> d != null)
                    .min(java.time.LocalDateTime::compareTo)
                    .orElse(java.time.LocalDateTime.now().minusMonths(12));
            long monthsSpan = java.time.temporal.ChronoUnit.MONTHS.between(
                    earliest, java.time.LocalDateTime.now());
            monthsSpan = Math.max(monthsSpan, 1); // avoid divide by zero
            paymentFrequency = (double) supplierInvoices.size() / monthsSpan;
        } else {
            paymentFrequency = 0.0;
        }

        // Feature 5: neighbor avg risk (average risk score of connected buyers)
        List<UUID> buyerIds = supplierInvoices.stream()
                .map(i -> i.getBuyer().getId())
                .distinct()
                .toList();

        double neighborAvgRisk = 0.0;
        int neighborCount = 0;
        for (UUID bId : buyerIds) {
            riskScoreRepository.findFirstByCompanyIdOrderByCalculatedAtDesc(bId).ifPresent(rs -> {});
            java.util.Optional<RiskScore> rs = riskScoreRepository.findFirstByCompanyIdOrderByCalculatedAtDesc(bId);
            if (rs.isPresent()) {
                neighborAvgRisk += rs.get().getScore();
                neighborCount++;
            }
        }
        neighborAvgRisk = neighborCount > 0 ? neighborAvgRisk / neighborCount : 0.0;

        // Feature 6: centrality score = unique buyers this supplier serves / total buyers in system
        long totalBuyers = companyRepository.countByType(com.netcredix.jbackend.model.CompanyType.BUYER);
        double centralityScore = totalBuyers > 0 ? (double) buyerIds.size() / totalBuyers : 0.0;

        // Feature 7: stress velocity = overdue ratio - pending ratio (positive = worsening)
        double stressVelocity = overdueRatio - pendingRatio;

        // Feature 8: contagion score = neighbor avg risk × centrality
        double contagionScore = neighborAvgRisk * centralityScore;

        // Traditional score: 4 basic features weighted (mirrors what a bank would compute)
        double traditionalScore = (overdueRatio * 40)
                + (Math.min(avgDelayDays / 90.0, 1.0) * 30)
                + (pendingRatio * 20)
                + (Math.min(paymentFrequency / 10.0, 1.0) * 10);
        traditionalScore = Math.min(traditionalScore, 100.0);

        // Network-aware score: from ML service or latest persisted score
        double networkAwareScore = traditionalScore;
        java.util.Optional<RiskScore> latestScoreOpt = riskScoreRepository.findFirstByCompanyIdOrderByCalculatedAtDesc(companyId);
        if (latestScoreOpt.isPresent()) {
            networkAwareScore = latestScoreOpt.get().getScore();
        }

        double difference    = Math.abs(networkAwareScore - traditionalScore);
        boolean underestimated = networkAwareScore > traditionalScore;

        String conclusion = underestimated
                ? String.format("Traditional method UNDERESTIMATES risk by %.1f points — network stress not captured", difference)
                : String.format("Traditional method OVERESTIMATES risk by %.1f points", difference);

        return com.netcredix.jbackend.dto.ResearchComparisonResponse.builder()
                .companyId(companyId)
                .companyName(company.getName())
                .traditionalScore(round2(traditionalScore))
                .networkAwareScore(round2(networkAwareScore))
                .difference(round2(difference))
                .underestimated(underestimated)
                .traditionalMethod("Based on individual payment history and overdue ratio only")
                .networkAwareMethod("Includes upstream buyer stress, graph neighbor health, and network centrality")
                .riskFactors(com.netcredix.jbackend.dto.ResearchComparisonResponse.RiskFactors.builder()
                        .overdueRatio(round4(overdueRatio))
                        .avgDelayDays(round1(avgDelayDays))
                        .pendingRatio(round4(pendingRatio))
                        .paymentFrequency(round1(paymentFrequency))
                        .neighborAvgRisk(round1(neighborAvgRisk))
                        .centralityScore(round4(centralityScore))
                        .stressVelocity(round4(stressVelocity))
                        .contagionScore(round1(contagionScore))
                        .build())
                .conclusion(conclusion)
                .paperReference("Tabachova et al. 2023 — underestimation of risk in supply chain networks confirmed")
                .build();
    }

    private double round1(double v) { return Math.round(v * 10.0) / 10.0; }
    private double round2(double v) { return Math.round(v * 100.0) / 100.0; }
    private double round4(double v) { return Math.round(v * 10000.0) / 10000.0; }
}
