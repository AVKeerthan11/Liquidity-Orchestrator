package com.netcredix.jbackend.repository;

import com.netcredix.jbackend.model.Company;
import com.netcredix.jbackend.model.CompanyType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CompanyRepository extends JpaRepository<Company, UUID> {
    boolean existsByGstNumber(String gstNumber);
    long countByType(CompanyType type);
    List<Company> findByType(CompanyType type);
}
