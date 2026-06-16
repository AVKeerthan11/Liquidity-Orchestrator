package com.netcredix.jbackend.service;

import com.netcredix.jbackend.model.Invoice;
import com.netcredix.jbackend.repository.InvoiceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * One-time sync service to populate Neo4j with existing PostgreSQL invoice data.
 * Runs automatically on application startup.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GraphSyncService {

    private final InvoiceRepository invoiceRepository;
    private final GraphService graphService;

    @EventListener(ApplicationReadyEvent.class)
    public void syncExistingInvoicesToNeo4j() {
        log.info("=== GRAPH SYNC: Starting one-time sync of existing invoices to Neo4j");
        
        try {
            List<Invoice> allInvoices = invoiceRepository.findAll();
            log.info("=== GRAPH SYNC: Found {} invoices to sync", allInvoices.size());
            
            int synced = 0;
            int failed = 0;
            
            for (Invoice invoice : allInvoices) {
                try {
                    graphService.upsertSupplyRelationship(
                        invoice.getSupplier().getId().toString(),
                        invoice.getSupplier().getName(),
                        invoice.getSupplier().getType().name(),
                        invoice.getBuyer().getId().toString(),
                        invoice.getBuyer().getName(),
                        invoice.getBuyer().getType().name(),
                        invoice.getId().toString(),
                        invoice.getAmount().toPlainString(),
                        invoice.getDueDate().toString(),
                        invoice.getStatus().name()
                    );
                    synced++;
                } catch (Exception e) {
                    failed++;
                    log.warn("=== GRAPH SYNC: Failed to sync invoice {}: {}", invoice.getId(), e.getMessage());
                }
            }
            
            log.info("=== GRAPH SYNC: Complete! Synced: {}, Failed: {}", synced, failed);
            
        } catch (Exception e) {
            log.error("=== GRAPH SYNC: Fatal error during sync: {}", e.getMessage(), e);
        }
    }
}
