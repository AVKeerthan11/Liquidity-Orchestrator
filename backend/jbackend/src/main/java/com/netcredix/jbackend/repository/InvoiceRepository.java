package com.netcredix.jbackend.repository;

import com.netcredix.jbackend.model.Invoice;
import com.netcredix.jbackend.model.InvoiceStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {

    @Query("SELECT i FROM Invoice i WHERE i.supplier.id = :companyId OR i.buyer.id = :companyId")
    List<Invoice> findByCompanyId(@Param("companyId") UUID companyId);

    @Query("SELECT i FROM Invoice i JOIN FETCH i.supplier JOIN FETCH i.buyer WHERE i.supplier.id = :companyId OR i.buyer.id = :companyId")
    List<Invoice> findByCompanyIdWithCompanies(@Param("companyId") UUID companyId);

    List<Invoice> findByBuyerId(UUID buyerId);

    List<Invoice> findBySupplierId(UUID supplierId);

    List<Invoice> findBySupplierIdAndStatusIn(UUID supplierId, List<InvoiceStatus> statuses);

    long countBySupplierId(UUID supplierId);

    long countBySupplierIdAndStatus(UUID supplierId, InvoiceStatus status);

    List<Invoice> findTop5BySupplierIdOrderByCreatedAtDesc(UUID supplierId);
}
