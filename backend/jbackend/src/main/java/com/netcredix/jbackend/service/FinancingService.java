package com.netcredix.jbackend.service;

import com.netcredix.jbackend.dto.FinancingOptionResponse;
import com.netcredix.jbackend.model.*;
import com.netcredix.jbackend.repository.CompanyRepository;
import com.netcredix.jbackend.repository.FinancingOfferRepository;
import com.netcredix.jbackend.repository.InvoiceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@RequiredArgsConstructor
public class FinancingService {

    private final InvoiceRepository invoiceRepository;
    private final FinancingOfferRepository financingOfferRepository;
    private final CompanyRepository companyRepository;

    @Transactional
    public List<FinancingOptionResponse> generateFinancingOptions(UUID supplierId) {
        Company supplier = companyRepository.findById(supplierId)
                .orElseThrow(() -> new RuntimeException("Supplier not found"));

        List<FinancingOffer> existingOffers = new ArrayList<>();
        for (FinancingOffer o : financingOfferRepository.findBySupplierId(supplierId)) {
            if (o.getStatus() == FinancingStatus.PENDING) {
                existingOffers.add(o);
            }
        }

        if (!existingOffers.isEmpty()) {
            Map<FinancingType, FinancingOptionResponse> uniqueOptions = new EnumMap<>(FinancingType.class);
            for (FinancingOffer offer : existingOffers) {
                if (uniqueOptions.containsKey(offer.getType())) continue;

                FinancingType type = offer.getType();
                BigDecimal recAmt = offer.getAmount();
                BigDecimal cost = offer.getCost();
                BigDecimal origAmt;
                int speed;
                BigDecimal prob;

                if (type == FinancingType.EARLY_PAYMENT) {
                    origAmt = recAmt.add(cost);
                    speed = 1;
                    prob = new BigDecimal("0.95");
                } else if (type == FinancingType.INVOICE_DISCOUNTING) {
                    origAmt = recAmt.add(cost);
                    speed = 3;
                    prob = new BigDecimal("0.85");
                } else {
                    origAmt = recAmt;
                    speed = 5;
                    prob = new BigDecimal("0.70");
                }

                BigDecimal score = calculateScore(cost, speed, prob);
                uniqueOptions.put(type, createOption(type, origAmt, recAmt, cost, speed, prob, score));
            }

            List<FinancingOptionResponse> mappedOptions = new ArrayList<>(uniqueOptions.values());
            if (!mappedOptions.isEmpty()) {
                FinancingOptionResponse recommended = mappedOptions.stream()
                        .max(Comparator.comparing(FinancingOptionResponse::getRoutingScore))
                        .orElse(mappedOptions.get(0));
                recommended.setRecommended(true);
            }
            return mappedOptions;
        }

        List<Invoice> invoices = invoiceRepository.findBySupplierIdAndStatusIn(
                supplierId, List.of(InvoiceStatus.PENDING, InvoiceStatus.OVERDUE));

        if (invoices.isEmpty()) {
            return Collections.emptyList();
        }

        BigDecimal originalAmount = BigDecimal.ZERO;
        BigDecimal optionA_Pnow = BigDecimal.ZERO;
        BigDecimal optionB_Pnow = BigDecimal.ZERO;
        BigDecimal optionC_Repayment = BigDecimal.ZERO;

        BigDecimal d = new BigDecimal("0.03");
        BigDecimal rF = new BigDecimal("0.06");
        BigDecimal rC = new BigDecimal("0.08");
        BigDecimal daysInYear = new BigDecimal("365");

        for (Invoice invoice : invoices) {
            BigDecimal amt = invoice.getAmount();
            originalAmount = originalAmount.add(amt);

            long tDays = ChronoUnit.DAYS.between(LocalDate.now(), invoice.getDueDate());
            if (tDays <= 0) tDays = 30;

            BigDecimal t = BigDecimal.valueOf(tDays);

            BigDecimal factorA = BigDecimal.ONE.subtract(d.multiply(t).divide(daysInYear, 4, RoundingMode.HALF_UP));
            optionA_Pnow = optionA_Pnow.add(amt.multiply(factorA));

            BigDecimal factorB = BigDecimal.ONE.subtract(rF.multiply(t).divide(daysInYear, 4, RoundingMode.HALF_UP));
            optionB_Pnow = optionB_Pnow.add(amt.multiply(factorB));

            BigDecimal factorC = BigDecimal.ONE.add(rC.multiply(t).divide(daysInYear, 4, RoundingMode.HALF_UP));
            optionC_Repayment = optionC_Repayment.add(amt.multiply(factorC));
        }

        BigDecimal costA = originalAmount.subtract(optionA_Pnow).max(new BigDecimal("0.01"));
        BigDecimal costB = originalAmount.subtract(optionB_Pnow).max(new BigDecimal("0.01"));
        BigDecimal costC = optionC_Repayment.subtract(originalAmount).max(new BigDecimal("0.01"));

        int speedA = 1; BigDecimal probA = new BigDecimal("0.95");
        int speedB = 3; BigDecimal probB = new BigDecimal("0.85");
        int speedC = 5; BigDecimal probC = new BigDecimal("0.70");

        BigDecimal scoreA = calculateScore(costA, speedA, probA);
        BigDecimal scoreB = calculateScore(costB, speedB, probB);
        BigDecimal scoreC = calculateScore(costC, speedC, probC);

        List<FinancingOptionResponse> options = new ArrayList<>();
        options.add(createOption(FinancingType.EARLY_PAYMENT, originalAmount, optionA_Pnow, costA, speedA, probA, scoreA));
        options.add(createOption(FinancingType.INVOICE_DISCOUNTING, originalAmount, optionB_Pnow, costB, speedB, probB, scoreB));
        options.add(createOption(FinancingType.MICRO_CREDIT, originalAmount, originalAmount, costC, speedC, probC, scoreC));

        FinancingOptionResponse recommended = options.stream()
                .max(Comparator.comparing(FinancingOptionResponse::getRoutingScore))
                .orElse(options.get(0));
        recommended.setRecommended(true);

        for (FinancingOptionResponse opt : options) {
            FinancingOffer offer = FinancingOffer.builder()
                    .supplier(supplier)
                    .type(opt.getType())
                    .amount(opt.getReceivableAmount())
                    .cost(opt.getCost())
                    .status(FinancingStatus.PENDING)
                    .build();
            financingOfferRepository.save(offer);
        }

        return options;
    }
    
    @Transactional
    public com.netcredix.jbackend.dto.FinancingOfferResponse acceptOffer(UUID offerId) {
        FinancingOffer offer = financingOfferRepository.findById(offerId)
                .orElseThrow(() -> new RuntimeException("Offer not found"));
        offer.setStatus(FinancingStatus.ACCEPTED);
        offer = financingOfferRepository.save(offer);
        
        return com.netcredix.jbackend.dto.FinancingOfferResponse.builder()
                .id(offer.getId())
                .supplierId(offer.getSupplier().getId())
                .type(offer.getType())
                .amount(offer.getAmount())
                .cost(offer.getCost())
                .status(offer.getStatus())
                .createdAt(offer.getCreatedAt())
                .build();
    }

    private BigDecimal calculateScore(BigDecimal cost, int speedDays, BigDecimal probability) {
        BigDecimal w1 = new BigDecimal("0.4");
        BigDecimal w2 = new BigDecimal("0.3");
        BigDecimal w3 = new BigDecimal("0.3");

        BigDecimal costBd = cost.max(new BigDecimal("0.01"));
        BigDecimal speedBd = BigDecimal.valueOf(speedDays);

        BigDecimal term1 = w1.multiply(BigDecimal.ONE.divide(costBd, 4, RoundingMode.HALF_UP));
        BigDecimal term2 = w2.multiply(BigDecimal.ONE.divide(speedBd, 4, RoundingMode.HALF_UP));
        BigDecimal term3 = w3.multiply(probability);

        return term1.add(term2).add(term3);
    }

    private FinancingOptionResponse createOption(FinancingType type, BigDecimal orig, BigDecimal rec, BigDecimal cost, int speed, BigDecimal prob, BigDecimal score) {
        return FinancingOptionResponse.builder()
                .type(type)
                .originalAmount(orig.setScale(2, RoundingMode.HALF_UP))
                .receivableAmount(rec.setScale(2, RoundingMode.HALF_UP))
                .cost(cost.setScale(2, RoundingMode.HALF_UP))
                .speedDays(speed)
                .probability(prob.setScale(2, RoundingMode.HALF_UP))
                .routingScore(score.setScale(4, RoundingMode.HALF_UP))
                .recommended(false)
                .build();
    }
}
