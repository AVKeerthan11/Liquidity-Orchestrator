package com.netcredix.jbackend.service;

import com.netcredix.jbackend.model.Alert;
import com.netcredix.jbackend.model.AlertSeverity;
import com.netcredix.jbackend.model.Company;
import com.netcredix.jbackend.model.CompanyType;
import com.netcredix.jbackend.model.FinancingOffer;
import com.netcredix.jbackend.model.FinancingStatus;
import com.netcredix.jbackend.model.Invoice;
import com.netcredix.jbackend.model.InvoiceStatus;
import com.netcredix.jbackend.model.RiskScore;
import com.netcredix.jbackend.repository.AlertRepository;
import com.netcredix.jbackend.repository.CompanyRepository;
import com.netcredix.jbackend.repository.FinancingOfferRepository;
import com.netcredix.jbackend.repository.InvoiceRepository;
import com.netcredix.jbackend.repository.RiskScoreRepository;
import com.netcredix.jbackend.dto.AlertResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AlertService {

    private final AlertRepository alertRepository;
    private final RiskScoreRepository riskScoreRepository;
    private final InvoiceRepository invoiceRepository;
    private final CompanyRepository companyRepository;
    private final FinancingOfferRepository financingOfferRepository;

    @Transactional
    public void generateAlertsForCompany(UUID companyId) {
        alertRepository.deleteByCompanyId(companyId);
        log.info("Generating alerts for company: {}", companyId);

        Optional<Company> companyOpt = companyRepository.findById(companyId);
        if (companyOpt.isEmpty()) return;
        Company company = companyOpt.get();
        CompanyType type = company.getType();

        if (type == CompanyType.SUPPLIER) {
            generateSupplierAlerts(company);
        } else if (type == CompanyType.BUYER) {
            generateBuyerAlerts(company);
        } else if (type == CompanyType.FINANCIER) {
            generateFinancierAlerts(company);
        }
    }

    // ── SUPPLIER alerts — about their own invoices, risk, and financing ────────

    private void generateSupplierAlerts(Company company) {
        UUID id = company.getId();

        // Risk score alerts
        riskScoreRepository.findFirstByCompanyIdOrderByCalculatedAtDesc(id).ifPresent(rs -> {
            double score = rs.getScore();
            if (score >= 60) {
                createAlertIfNotExists(company,
                    "Your account is at critical risk — immediate financing recommended",
                    AlertSeverity.CRITICAL);
            } else if (score >= 30) {
                createAlertIfNotExists(company,
                    "Your account shows elevated risk — monitor your invoices closely",
                    AlertSeverity.MEDIUM);
            }
        });

        // Overdue invoice alerts
        List<Invoice> invoices = invoiceRepository.findBySupplierId(id);
        long overdueCount = invoices.stream().filter(i -> i.getStatus() == InvoiceStatus.OVERDUE).count();
        if (overdueCount > 0) {
            createAlertIfNotExists(company,
                overdueCount == 1
                    ? "You have 1 overdue invoice — follow up with your buyer to avoid penalties"
                    : "You have " + overdueCount + " overdue invoices — follow up with your buyers to avoid penalties",
                AlertSeverity.HIGH);
        }

        // Financing available alert
        boolean hasPendingOffers = financingOfferRepository
                .findBySupplierIdAndStatus(id, FinancingStatus.PENDING)
                .size() > 0;
        if (hasPendingOffers) {
            createAlertIfNotExists(company,
                "Financing options are available for your pending invoices — review them now",
                AlertSeverity.LOW);
        }
    }

    // ── BUYER alerts — about supplier health and network contagion ─────────────

    private void generateBuyerAlerts(Company company) {
        UUID buyerId = company.getId();

        // Find all suppliers this buyer owes money to
        List<Invoice> buyerInvoices = invoiceRepository.findByBuyerId(buyerId);
        java.util.Set<UUID> supplierIds = buyerInvoices.stream()
                .map(i -> i.getSupplier().getId())
                .collect(java.util.stream.Collectors.toSet());

        long criticalSuppliers = 0;
        long atRiskSuppliers   = 0;

        for (UUID sid : supplierIds) {
            Optional<RiskScore> rs = riskScoreRepository.findFirstByCompanyIdOrderByCalculatedAtDesc(sid);
            if (rs.isPresent()) {
                double score = rs.get().getScore();
                if (score >= 60) criticalSuppliers++;
                else if (score >= 30) atRiskSuppliers++;
            }
        }

        if (criticalSuppliers > 0) {
            createAlertIfNotExists(company,
                criticalSuppliers == 1
                    ? "1 supplier in your network is at critical risk — consider early payment to prevent disruption"
                    : criticalSuppliers + " suppliers in your network are at critical risk — consider early payments to prevent supply chain disruption",
                AlertSeverity.CRITICAL);
        }

        if (atRiskSuppliers > 0) {
            createAlertIfNotExists(company,
                atRiskSuppliers + " supplier(s) show elevated stress — monitor their payment behaviour closely",
                AlertSeverity.MEDIUM);
        }

        // Overdue payables alert — buyer owes money
        long overduePayables = buyerInvoices.stream()
                .filter(i -> i.getStatus() == InvoiceStatus.OVERDUE).count();
        if (overduePayables > 0) {
            createAlertIfNotExists(company,
                "You have " + overduePayables + " overdue payable(s) — settling them will reduce supplier stress in your network",
                AlertSeverity.HIGH);
        }
    }

    // ── FINANCIER alerts — only for offers assigned to THIS financier ──────────

    private void generateFinancierAlerts(Company company) {
        UUID financierId = company.getId();

        // Offers accepted by a supplier and assigned to this specific financier — awaiting their funding
        List<FinancingOffer> myAcceptedOffers = financingOfferRepository
                .findByFinancierIdAndStatus(financierId, FinancingStatus.ACCEPTED);

        for (FinancingOffer offer : myAcceptedOffers) {
            String supplierName = offer.getSupplier().getName();
            String typeName = offer.getType().name().replace('_', ' ');
            createAlertIfNotExists(company,
                supplierName + " has accepted your " + typeName + " offer — fund it now to complete the deal",
                AlertSeverity.HIGH);
        }

        // Suppliers THIS financier has funded that are now stressed
        List<FinancingOffer> myFundedOffers = financingOfferRepository
                .findByFinancierIdAndStatus(financierId, FinancingStatus.FUNDED);

        // One alert per stressed supplier — named individually so financier knows exactly who
        myFundedOffers.stream()
                .collect(Collectors.toMap(
                        o -> o.getSupplier().getId(),
                        o -> o,
                        (a, b) -> a // deduplicate by supplier
                ))
                .values()
                .forEach(offer -> {
                    UUID sid = offer.getSupplier().getId();
                    String supplierName = offer.getSupplier().getName();
                    String typeName = offer.getType().name().replace('_', ' ');
                    riskScoreRepository
                            .findFirstByCompanyIdOrderByCalculatedAtDesc(sid)
                            .ifPresent(rs -> {
                                double score = rs.getScore();
                                if (score >= 60) {
                                    createAlertIfNotExists(company,
                                        supplierName + " (funded via " + typeName + ", risk score: "
                                        + String.format("%.1f", score) + ") is now at critical risk — review immediately",
                                        AlertSeverity.CRITICAL);
                                } else if (score >= 40) {
                                    createAlertIfNotExists(company,
                                        supplierName + " (funded via " + typeName + ", risk score: "
                                        + String.format("%.1f", score) + ") shows elevated stress — monitor closely",
                                        AlertSeverity.HIGH);
                                }
                            });
                });
    }

    private void createAlertIfNotExists(Company company, String message, AlertSeverity severity) {
        Optional<Alert> existing = alertRepository.findByCompanyIdAndMessage(company.getId(), message);
        if (existing.isEmpty()) {
            Alert alert = Alert.builder()
                    .company(company)
                    .message(message)
                    .severity(severity)
                    .build();
            alertRepository.save(alert);
            log.info("Created new alert for company {}: {}", company.getId(), severity.name());
        }
    }

    /** Public entry point for services that need to fire a targeted alert immediately. */
    @Transactional
    public void createTargetedAlert(Company company, String message, AlertSeverity severity) {
        createAlertIfNotExists(company, message, severity);
    }

    public List<AlertResponse> getActiveAlerts(UUID companyId) {
        return alertRepository.findByCompanyIdOrderBySeverityDesc(companyId)
                .stream()
                .map(a -> AlertResponse.builder()
                        .id(a.getId())
                        .companyId(a.getCompany().getId())
                        .message(a.getMessage())
                        .severity(a.getSeverity())
                        .createdAt(a.getCreatedAt())
                        .build())
                .collect(Collectors.toList());
    }
}
