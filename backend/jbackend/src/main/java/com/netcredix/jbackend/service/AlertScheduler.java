package com.netcredix.jbackend.service;

import com.netcredix.jbackend.model.Company;
import com.netcredix.jbackend.repository.CompanyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class AlertScheduler {

    private final CompanyRepository companyRepository;
    private final AlertService alertService;

    // Runs every 6 hours
    @Scheduled(fixedRate = 21600000)
    public void generateAlertsForAllCompanies() {
        log.info("Starting scheduled alert generation for all companies");
        List<Company> companies = companyRepository.findAll();
        for (Company company : companies) {
            try {
                alertService.generateAlertsForCompany(company.getId());
            } catch (Exception e) {
                log.error("Failed to generate alerts for company {}", company.getId(), e);
            }
        }
        log.info("Completed scheduled alert generation");
    }
}
