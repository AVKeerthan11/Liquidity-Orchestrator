package com.netcredix.jbackend.service;

import com.netcredix.jbackend.dto.InvoiceRequest;
import com.netcredix.jbackend.dto.InvoiceResponse;
import com.netcredix.jbackend.dto.InvoiceStatusRequest;
import com.netcredix.jbackend.model.Company;
import com.netcredix.jbackend.model.Invoice;
import com.netcredix.jbackend.model.InvoiceStatus;
import com.netcredix.jbackend.repository.CompanyRepository;
import com.netcredix.jbackend.repository.InvoiceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class InvoiceService {

    private final InvoiceRepository invoiceRepository;
    private final CompanyRepository companyRepository;
    private final GraphService graphService;

    @Transactional
    public InvoiceResponse createInvoice(InvoiceRequest request) {
        Company supplier = companyRepository.findById(request.getSupplierId())
                .orElseThrow(() -> new IllegalArgumentException("Supplier not found"));
        Company buyer = companyRepository.findById(request.getBuyerId())
                .orElseThrow(() -> new IllegalArgumentException("Buyer not found"));

        Invoice invoice = Invoice.builder()
                .supplier(supplier)
                .buyer(buyer)
                .amount(request.getAmount())
                .dueDate(request.getDueDate())
                .status(InvoiceStatus.PENDING)
                .build();

        invoice = invoiceRepository.save(invoice);
        final Invoice savedInvoice = invoice;

        final String supplierIdStr = savedInvoice.getSupplier().getId().toString();
        final String supplierNameStr = savedInvoice.getSupplier().getName();
        final String supplierTypeStr = savedInvoice.getSupplier().getType().name();
        final String buyerIdStr = savedInvoice.getBuyer().getId().toString();
        final String buyerNameStr = savedInvoice.getBuyer().getName();
        final String buyerTypeStr = savedInvoice.getBuyer().getType().name();
        final String invoiceIdStr = savedInvoice.getId().toString();
        final String amountStr = savedInvoice.getAmount().toPlainString();
        final String dueDateStr = savedInvoice.getDueDate().toString();
        final String statusStr = savedInvoice.getStatus().name();

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                java.util.concurrent.CompletableFuture.runAsync(() -> {
                    try {
                        graphService.upsertSupplyRelationship(
                            supplierIdStr, supplierNameStr, supplierTypeStr,
                            buyerIdStr, buyerNameStr, buyerTypeStr,
                            invoiceIdStr, amountStr, dueDateStr, statusStr
                        );
                    } catch (Exception e) {
                        log.error("Neo4j graph sync failed for invoice {}: {}", invoiceIdStr, e.getMessage());
                    }
                });
            }
        });

        return toResponse(invoice);
    }

    public List<InvoiceResponse> getInvoicesByCompany(UUID companyId) {
        return invoiceRepository.findByCompanyId(companyId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public InvoiceResponse updateStatus(UUID invoiceId, InvoiceStatusRequest request) {
        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new IllegalArgumentException("Invoice not found"));

        invoice.setStatus(request.getStatus());
        invoice = invoiceRepository.save(invoice);
        final Invoice updatedInvoice = invoice;

        final String supplierIdStr = updatedInvoice.getSupplier().getId().toString();
        final String supplierNameStr = updatedInvoice.getSupplier().getName();
        final String supplierTypeStr = updatedInvoice.getSupplier().getType().name();
        final String buyerIdStr = updatedInvoice.getBuyer().getId().toString();
        final String buyerNameStr = updatedInvoice.getBuyer().getName();
        final String buyerTypeStr = updatedInvoice.getBuyer().getType().name();
        final String invoiceIdStr = updatedInvoice.getId().toString();
        final String amountStr = updatedInvoice.getAmount().toPlainString();
        final String dueDateStr = updatedInvoice.getDueDate().toString();
        final String statusStr = updatedInvoice.getStatus().name();

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                java.util.concurrent.CompletableFuture.runAsync(() -> {
                    try {
                        graphService.upsertSupplyRelationship(
                            supplierIdStr, supplierNameStr, supplierTypeStr,
                            buyerIdStr, buyerNameStr, buyerTypeStr,
                            invoiceIdStr, amountStr, dueDateStr, statusStr
                        );
                    } catch (Exception e) {
                        log.error("Neo4j graph sync failed for invoice {}: {}", invoiceIdStr, e.getMessage());
                    }
                });
            }
        });

        return toResponse(invoice);
    }

    private InvoiceResponse toResponse(Invoice invoice) {
        return InvoiceResponse.builder()
                .id(invoice.getId())
                .supplierId(invoice.getSupplier().getId())
                .supplierName(invoice.getSupplier().getName())
                .buyerId(invoice.getBuyer().getId())
                .buyerName(invoice.getBuyer().getName())
                .amount(invoice.getAmount())
                .dueDate(invoice.getDueDate())
                .status(invoice.getStatus())
                .createdAt(invoice.getCreatedAt())
                .build();
    }
}
