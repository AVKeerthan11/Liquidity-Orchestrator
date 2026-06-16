package com.netcredix.jbackend.repository;

import com.netcredix.jbackend.model.FinancingOffer;
import com.netcredix.jbackend.model.FinancingStatus;
import com.netcredix.jbackend.model.FinancingType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface FinancingOfferRepository extends JpaRepository<FinancingOffer, UUID> {
    List<FinancingOffer> findBySupplierId(UUID supplierId);
    List<FinancingOffer> findByStatus(FinancingStatus status);
    List<FinancingOffer> findBySupplierIdAndStatus(UUID supplierId, FinancingStatus status);
    List<FinancingOffer> findBySupplierIdAndStatusIn(UUID supplierId, List<FinancingStatus> statuses);
    List<FinancingOffer> findByStatusAndTypeNot(FinancingStatus status, FinancingType type);
    boolean existsBySupplierIdAndType(UUID supplierId, FinancingType type);

    @org.springframework.data.jpa.repository.Query(
        "SELECT o FROM FinancingOffer o LEFT JOIN FETCH o.financier LEFT JOIN FETCH o.supplier " +
        "WHERE o.supplier.id = :supplierId AND o.status IN :statuses")
    List<FinancingOffer> findBySupplierIdAndStatusInWithFinancier(
        @org.springframework.data.repository.query.Param("supplierId") UUID supplierId,
        @org.springframework.data.repository.query.Param("statuses") List<FinancingStatus> statuses);

    @org.springframework.data.jpa.repository.Query(
        "SELECT o FROM FinancingOffer o JOIN FETCH o.supplier " +
        "WHERE o.financier.id = :financierId AND o.status = :status")
    List<FinancingOffer> findByFinancierIdAndStatus(
        @org.springframework.data.repository.query.Param("financierId") UUID financierId,
        @org.springframework.data.repository.query.Param("status") FinancingStatus status);
}
