package com.netcredix.jbackend.controller;

import com.netcredix.jbackend.dto.RiskScoreResponse;
import com.netcredix.jbackend.dto.RiskScoreHistoryResponse;
import com.netcredix.jbackend.dto.Severity;
import com.netcredix.jbackend.model.RiskScore;
import com.netcredix.jbackend.repository.RiskScoreRepository;
import com.netcredix.jbackend.service.RiskScoreService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/risk")
@RequiredArgsConstructor
public class RiskScoreController {

    private final RiskScoreRepository riskScoreRepository;
    private final com.netcredix.jbackend.service.RiskScoreScheduler riskScoreScheduler;
    private final RiskScoreService riskScoreService;

    @PostMapping("/calculate/all")
    public ResponseEntity<String> calculateAllScores() {
        riskScoreScheduler.calculateRiskScoresForAllCompanies();
        return ResponseEntity.ok("Risk scores calculated and updated successfully");
    }

    @GetMapping("/score/{companyId}")
    public ResponseEntity<RiskScoreResponse> getRiskScore(@PathVariable UUID companyId) {
        Optional<RiskScore> latestScore = riskScoreRepository.findFirstByCompanyIdOrderByCalculatedAtDesc(companyId);

        return latestScore.map(score -> {
            Severity severity = determineSeverity(score.getScore());
            RiskScoreResponse response = new RiskScoreResponse(
                    score.getCompany().getId(),
                    score.getScore(),
                    severity,
                    score.getCalculatedAt()
            );
            return ResponseEntity.ok(response);
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    private Severity determineSeverity(Double score) {
        if (score < 30) {
            return Severity.GREEN;
        } else if (score <= 60) {
            return Severity.YELLOW;
        } else {
            return Severity.RED;
        }
    }

    @GetMapping("/history/{companyId}")
    public ResponseEntity<List<RiskScoreHistoryResponse>> getRiskScoreHistory(
            @PathVariable UUID companyId,
            @RequestParam(defaultValue = "30") int days) {
        List<RiskScoreHistoryResponse> history = riskScoreService.getRiskScoreHistory(companyId, days);
        return ResponseEntity.ok(history);
    }
}
