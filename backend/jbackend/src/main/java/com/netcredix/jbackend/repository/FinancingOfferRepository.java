package com.netcredix.jbackend.repository;

import com.netcredix.jbackend.model.FinancingOffer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface FinancingOfferRepository extends JpaRepository<FinancingOffer, UUID> {
}
