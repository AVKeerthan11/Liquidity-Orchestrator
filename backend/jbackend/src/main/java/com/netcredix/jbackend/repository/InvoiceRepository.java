package com.netcredix.jbackend.repository;

import com.netcredix.jbackend.model.Invoice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {

    @Query("SELECT i FROM Invoice i WHERE i.supplier.id = :companyId OR i.buyer.id = :companyId")
    List<Invoice> findByCompanyId(@Param("companyId") UUID companyId);

    List<Invoice> findByBuyerId(UUID buyerId);
}
