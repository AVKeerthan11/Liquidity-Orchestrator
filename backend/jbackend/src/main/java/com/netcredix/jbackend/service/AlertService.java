package com.netcredix.jbackend.service;

import com.netcredix.jbackend.model.Alert;
import com.netcredix.jbackend.model.AlertSeverity;
import com.netcredix.jbackend.model.Company;
import com.netcredix.jbackend.model.Invoice;
import com.netcredix.jbackend.model.InvoiceStatus;
import com.netcredix.jbackend.model.RiskScore;
import com.netcredix.jbackend.repository.AlertRepository;
import com.netcredix.jbackend.repository.CompanyRepository;
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

    @Transactional
    public void generateAlertsForCompany(UUID companyId) {
        log.info("Generating alerts for company: {}", companyId);
        
        Optional<Company> companyOpt = companyRepository.findById(companyId);
        if (companyOpt.isEmpty()) {
            return;
        }
        Company company = companyOpt.get();

        Optional<RiskScore> latestScoreOpt = riskScoreRepository.findFirstByCompanyIdOrderByCalculatedAtDesc(companyId);
        if (latestScoreOpt.isPresent()) {
            double score = latestScoreOpt.get().getScore();
            if (score >= 60) {
                createAlertIfNotExists(company, "Risk score is critically high (>= 60)", AlertSeverity.CRITICAL);
            } else if (score >= 30) {
                createAlertIfNotExists(company, "Risk score is moderately high (>= 30)", AlertSeverity.MEDIUM);
            }
        }

        List<Invoice> invoices = invoiceRepository.findByCompanyId(companyId);
        
        boolean hasOverdue = invoices.stream()
                .anyMatch(i -> i.getStatus() == InvoiceStatus.OVERDUE);

        if (hasOverdue) {
            createAlertIfNotExists(company, "One or more invoices are OVERDUE", AlertSeverity.HIGH);
        }
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
