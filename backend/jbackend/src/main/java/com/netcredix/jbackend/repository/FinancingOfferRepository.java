package com.netcredix.jbackend.repository;

import com.netcredix.jbackend.model.FinancingOffer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

import com.netcredix.jbackend.model.FinancingStatus;
import java.util.List;

public interface FinancingOfferRepository extends JpaRepository<FinancingOffer, UUID> {
    List<FinancingOffer> findBySupplierId(UUID supplierId);
    List<FinancingOffer> findByStatus(FinancingStatus status);
}
