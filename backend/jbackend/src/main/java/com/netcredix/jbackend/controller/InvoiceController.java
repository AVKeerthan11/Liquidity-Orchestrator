package com.netcredix.jbackend.controller;

import com.netcredix.jbackend.dto.InvoiceRequest;
import com.netcredix.jbackend.dto.InvoiceResponse;
import com.netcredix.jbackend.dto.InvoiceStatusRequest;
import com.netcredix.jbackend.service.InvoiceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/invoices")
@RequiredArgsConstructor
public class InvoiceController {

    private final InvoiceService invoiceService;

    @PostMapping
    @PreAuthorize("hasRole('SUPPLIER')")
    public ResponseEntity<InvoiceResponse> createInvoice(@Valid @RequestBody InvoiceRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(invoiceService.createInvoice(request));
    }

    @GetMapping("/company/{companyId}")
    @PreAuthorize("hasAnyRole('SUPPLIER', 'BUYER', 'FINANCIER', 'ADMIN')")
    public ResponseEntity<List<InvoiceResponse>> getByCompany(@PathVariable UUID companyId) {
        return ResponseEntity.ok(invoiceService.getInvoicesByCompany(companyId));
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('SUPPLIER', 'BUYER', 'FINANCIER', 'ADMIN')")
    public ResponseEntity<InvoiceResponse> updateStatus(
            @PathVariable UUID id,
            @Valid @RequestBody InvoiceStatusRequest request) {
        return ResponseEntity.ok(invoiceService.updateStatus(id, request));
    }
}
