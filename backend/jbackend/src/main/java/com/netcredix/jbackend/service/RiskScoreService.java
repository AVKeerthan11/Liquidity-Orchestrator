package com.netcredix.jbackend.service;

import com.netcredix.jbackend.model.Invoice;
import com.netcredix.jbackend.model.InvoiceStatus;
import com.netcredix.jbackend.model.Payment;
import com.netcredix.jbackend.repository.InvoiceRepository;
import com.netcredix.jbackend.repository.PaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class RiskScoreService {

    private final InvoiceRepository invoiceRepository;
    private final PaymentRepository paymentRepository;

    public Double calculateRiskScore(UUID companyId) {
        log.info("Calculating risk score for company {}", companyId);

        List<Invoice> invoices = invoiceRepository.findByBuyerId(companyId);
        List<Payment> payments = paymentRepository.findByInvoiceBuyerId(companyId);

        double overdueRatio = calculateOverdueRatio(invoices);
        double avgDelayDays = calculateAvgDelayDays(payments);
        double pendingAmountRatio = calculatePendingAmountRatio(invoices);

        double finalScore = overdueRatio + avgDelayDays + pendingAmountRatio;
        
        return Math.min(finalScore, 100.0);
    }

    private double calculateOverdueRatio(List<Invoice> invoices) {
        if (invoices.isEmpty()) {
            return 0.0;
        }
        
        long overdueInvoices = invoices.stream()
                .filter(i -> i.getStatus() == InvoiceStatus.OVERDUE)
                .count();
                
        return ((double) overdueInvoices / invoices.size()) * 40.0;
    }

    private double calculateAvgDelayDays(List<Payment> payments) {
        List<Payment> validPayments = payments.stream()
                .filter(p -> p.getDelayDays() != null && p.getDelayDays() > 0)
                .toList();

        if (validPayments.isEmpty()) {
            return 0.0;
        }

        double totalDelay = validPayments.stream()
                .mapToDouble(Payment::getDelayDays)
                .sum();

        double avgDelay = totalDelay / validPayments.size();
        return avgDelay * 0.3;
    }

    private double calculatePendingAmountRatio(List<Invoice> invoices) {
        BigDecimal totalAmount = invoices.stream()
                .map(Invoice::getAmount)
                .filter(amount -> amount != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        if (totalAmount.compareTo(BigDecimal.ZERO) == 0) {
            return 0.0;
        }

        BigDecimal pendingAmount = invoices.stream()
                .filter(i -> i.getStatus() == InvoiceStatus.PENDING)
                .map(Invoice::getAmount)
                .filter(amount -> amount != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        double ratio = pendingAmount.divide(totalAmount, 4, RoundingMode.HALF_UP).doubleValue();
        return ratio * 30.0;
    }
}
