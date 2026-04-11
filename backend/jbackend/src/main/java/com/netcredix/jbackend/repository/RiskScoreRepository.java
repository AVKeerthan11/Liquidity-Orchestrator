package com.netcredix.jbackend.repository;

import com.netcredix.jbackend.model.RiskScore;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface RiskScoreRepository extends JpaRepository<RiskScore, UUID> {
    Optional<RiskScore> findFirstByCompanyIdOrderByCalculatedAtDesc(UUID companyId);
}
