package com.netcredix.jbackend.service;

import com.netcredix.jbackend.model.Company;
import com.netcredix.jbackend.model.RiskScore;
import com.netcredix.jbackend.repository.CompanyRepository;
import com.netcredix.jbackend.repository.RiskScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class RiskScoreScheduler {

    private final CompanyRepository companyRepository;
    private final RiskScoreService riskScoreService;
    private final RiskScoreRepository riskScoreRepository;
    private final GraphService graphService;

    // Runs every 6 hours
    @Scheduled(cron = "0 0 */6 * * *")
    public void calculateRiskScoresForAllCompanies() {
        log.info("Starting scheduled risk score calculation for all companies");

        List<Company> companies = companyRepository.findAll();

        for (Company company : companies) {
            try {
                Double score = riskScoreService.calculateRiskScore(company.getId());

                RiskScore riskScore = RiskScore.builder()
                        .company(company)
                        .score(score)
                        .calculatedAt(LocalDateTime.now())
                        .build();

                riskScoreRepository.save(riskScore);
                
                graphService.updateCompanyRiskScore(company.getId().toString(), score);
                
                log.info("Successfully updated risk score for company {}: {}", company.getId(), score);
            } catch (Exception e) {
                log.error("Failed to calculate risk score for company {}: {}", company.getId(), e.getMessage(), e);
            }
        }

        log.info("Finished scheduled risk score calculation");
    }
}
