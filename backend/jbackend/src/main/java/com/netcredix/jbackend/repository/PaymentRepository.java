package com.netcredix.jbackend.repository;

import com.netcredix.jbackend.model.Payment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {
    List<Payment> findByInvoiceBuyerId(UUID companyId);
}
