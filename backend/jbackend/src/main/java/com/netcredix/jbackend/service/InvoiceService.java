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

        // Run Neo4j sync after JPA transaction commits to avoid cross-store conflicts
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    graphService.upsertSupplyRelationship(savedInvoice);
                } catch (Exception e) {
                    log.error("Neo4j graph sync failed for invoice {}: {}", savedInvoice.getId(), e.getMessage());
                }
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

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    graphService.upsertSupplyRelationship(updatedInvoice);
                } catch (Exception e) {
                    log.error("Neo4j graph sync failed for invoice {}: {}", updatedInvoice.getId(), e.getMessage());
                }
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
