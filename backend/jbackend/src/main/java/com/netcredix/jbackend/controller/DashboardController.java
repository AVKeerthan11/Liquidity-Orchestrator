package com.netcredix.jbackend.controller;

import com.netcredix.jbackend.dto.BuyerDashboardResponse;
import com.netcredix.jbackend.dto.FinancierDashboardResponse;
import com.netcredix.jbackend.dto.SupplierDashboardResponse;
import com.netcredix.jbackend.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    @GetMapping("/supplier/{companyId}")
    @PreAuthorize("hasAnyRole('SUPPLIER', 'BUYER', 'FINANCIER', 'ADMIN')")
    public ResponseEntity<SupplierDashboardResponse> getSupplierDashboard(@PathVariable UUID companyId) {
        return ResponseEntity.ok(dashboardService.getSupplierDashboard(companyId));
    }

    @GetMapping("/buyer/{companyId}")
    @PreAuthorize("hasAnyRole('SUPPLIER', 'BUYER', 'FINANCIER', 'ADMIN')")
    public ResponseEntity<BuyerDashboardResponse> getBuyerDashboard(@PathVariable UUID companyId) {
        return ResponseEntity.ok(dashboardService.getBuyerDashboard(companyId));
    }

    @GetMapping("/financier/{companyId}")
    @PreAuthorize("hasAnyRole('SUPPLIER', 'BUYER', 'FINANCIER', 'ADMIN')")
    public ResponseEntity<FinancierDashboardResponse> getFinancierDashboard(@PathVariable UUID companyId) {
        return ResponseEntity.ok(dashboardService.getFinancierDashboard());
    }
}
