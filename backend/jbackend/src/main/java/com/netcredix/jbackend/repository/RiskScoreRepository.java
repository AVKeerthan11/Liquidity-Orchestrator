package com.netcredix.jbackend.repository;

import com.netcredix.jbackend.model.RiskScore;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RiskScoreRepository extends JpaRepository<RiskScore, UUID> {
    Optional<RiskScore> findFirstByCompanyIdOrderByCalculatedAtDesc(UUID companyId);

    @Query("SELECT r FROM RiskScore r WHERE r.calculatedAt = (SELECT MAX(r2.calculatedAt) FROM RiskScore r2 WHERE r2.company.id = r.company.id)")
    List<RiskScore> findAllLatestRiskScores();

    @Query("SELECT r FROM RiskScore r WHERE r.company.id = :companyId AND r.calculatedAt >= :since ORDER BY r.calculatedAt ASC")
    List<RiskScore> findHistoryByCompanyId(@Param("companyId") UUID companyId, @Param("since") LocalDateTime since);
}
