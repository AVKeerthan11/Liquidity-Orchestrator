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
}
