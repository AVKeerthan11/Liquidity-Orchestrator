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

    @Query(value = "SELECT * FROM alerts WHERE company_id = :companyId " +
           "ORDER BY CASE severity " +
           "WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END ASC",
           nativeQuery = true)
    List<Alert> findByCompanyIdOrderBySeverityDesc(@Param("companyId") UUID companyId);

    @Query("SELECT a FROM Alert a WHERE a.company.id = :companyId AND a.message = :message")
    Optional<Alert> findByCompanyIdAndMessage(@Param("companyId") UUID companyId, @Param("message") String message);

    void deleteByCompanyId(UUID companyId);
}
