package com.netcredix.jbackend.repository;

import com.netcredix.jbackend.model.Alert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AlertRepository extends JpaRepository<Alert, UUID> {

    @Query("SELECT a FROM Alert a WHERE a.company.id = :companyId ORDER BY " +
           "CASE a.severity " +
           "WHEN com.netcredix.jbackend.model.AlertSeverity.CRITICAL THEN 1 " +
           "WHEN com.netcredix.jbackend.model.AlertSeverity.HIGH THEN 2 " +
           "WHEN com.netcredix.jbackend.model.AlertSeverity.MEDIUM THEN 3 " +
           "WHEN com.netcredix.jbackend.model.AlertSeverity.LOW THEN 4 " +
           "ELSE 5 END ASC")
    List<Alert> findByCompanyIdOrderBySeverityDesc(@Param("companyId") UUID companyId);

    Optional<Alert> findByCompanyIdAndMessage(UUID companyId, String message);
}
