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
        
        List<Invoice> invoices = invoiceRepository.findByCompanyId(companyId);
        List<Payment> payments = paymentRepository.findByInvoiceSupplierId(companyId);

        double overdueRatio = calculateOverdueRatio(invoices);
        double avgDelayDays = calculateAvgDelayDays(payments);

        double traditionalScore = (overdueRatio * 60) + ((avgDelayDays / 90) * 40);
        traditionalScore = Math.min(traditionalScore, 100.0);

        double networkAwareScore = traditionalScore;
        java.util.Optional<RiskScore> latestScoreOpt = riskScoreRepository.findFirstByCompanyIdOrderByCalculatedAtDesc(companyId);
        if (latestScoreOpt.isPresent()) {
            networkAwareScore = latestScoreOpt.get().getScore();
        }

        double difference = Math.abs(networkAwareScore - traditionalScore);
        boolean underestimated = networkAwareScore > traditionalScore;

        List<Invoice> supplierInvoices = invoiceRepository.findBySupplierId(companyId);
        List<UUID> buyerIds = supplierInvoices.stream().map(i -> i.getBuyer().getId()).distinct().toList();

        double neighborStressSum = 0;
        int neighborCount = 0;
        for (UUID bId : buyerIds) {
            java.util.Optional<RiskScore> rs = riskScoreRepository.findFirstByCompanyIdOrderByCalculatedAtDesc(bId);
            if (rs.isPresent()) {
                neighborStressSum += rs.get().getScore();
                neighborCount++;
            }
        }
        double avgNeighborStress = neighborCount > 0 ? (neighborStressSum / neighborCount) / 100.0 : 0.0;

        String conclusion;
        if (underestimated) {
            conclusion = String.format("Traditional method UNDERESTIMATES risk by %.1f points — network stress not captured", difference);
        } else {
            conclusion = String.format("Traditional method OVERESTIMATES risk by %.1f points", difference);
        }

        return com.netcredix.jbackend.dto.ResearchComparisonResponse.builder()
                .companyId(companyId)
                .companyName(company.getName())
                .traditionalScore(traditionalScore)
                .networkAwareScore(networkAwareScore)
                .difference(difference)
                .underestimated(underestimated)
                .traditionalMethod("Based on individual payment history and overdue ratio only")
                .networkAwareMethod("Includes upstream buyer stress, graph neighbor health, and network centrality")
                .riskFactors(com.netcredix.jbackend.dto.ResearchComparisonResponse.RiskFactors.builder()
                        .overdueRatio(overdueRatio)
                        .avgDelayDays(avgDelayDays)
                        .neighborStress(avgNeighborStress)
                        .build())
                .conclusion(conclusion)
                .paperReference("Tabachova et al. 2023 — underestimation of risk in supply chain networks confirmed")
                .build();
    }
}
