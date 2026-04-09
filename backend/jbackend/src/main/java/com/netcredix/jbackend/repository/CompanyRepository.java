package com.netcredix.jbackend.repository;

import com.netcredix.jbackend.model.Company;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface CompanyRepository extends JpaRepository<Company, UUID> {
    boolean existsByGstNumber(String gstNumber);
}
