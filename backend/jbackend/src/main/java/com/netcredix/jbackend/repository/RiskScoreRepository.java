package com.netcredix.jbackend.repository;

import com.netcredix.jbackend.model.RiskScore;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface RiskScoreRepository extends JpaRepository<RiskScore, UUID> {
    Optional<RiskScore> findFirstByCompanyIdOrderByCalculatedAtDesc(UUID companyId);

    @org.springframework.data.jpa.repository.Query("SELECT r FROM RiskScore r WHERE r.calculatedAt = (SELECT MAX(r2.calculatedAt) FROM RiskScore r2 WHERE r2.company.id = r.company.id)")
    java.util.List<RiskScore> findAllLatestRiskScores();
}
