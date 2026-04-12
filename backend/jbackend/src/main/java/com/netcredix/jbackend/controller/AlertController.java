package com.netcredix.jbackend.controller;

import com.netcredix.jbackend.dto.AlertResponse;
import com.netcredix.jbackend.service.AlertService;
import com.netcredix.jbackend.service.AlertScheduler;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/alerts")
@RequiredArgsConstructor
public class AlertController {

    private final AlertService alertService;
    private final AlertScheduler alertScheduler;
    @GetMapping("/active/{companyId}")
    public ResponseEntity<List<AlertResponse>> getActiveAlerts(@PathVariable UUID companyId) {
        return ResponseEntity.ok(alertService.getActiveAlerts(companyId));
    }

    @PostMapping("/generate/all")
    @PreAuthorize("hasAnyRole('SUPPLIER','BUYER','FINANCIER','ADMIN')")
    public ResponseEntity<String> generateAllAlerts() {
        alertScheduler.generateAlertsForAllCompanies();
        return ResponseEntity.ok("Alerts generated successfully");
    }
}
