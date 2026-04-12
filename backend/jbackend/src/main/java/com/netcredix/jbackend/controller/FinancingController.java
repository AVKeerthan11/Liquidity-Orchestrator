package com.netcredix.jbackend.controller;

import com.netcredix.jbackend.dto.FinancingOptionResponse;
import com.netcredix.jbackend.service.FinancingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/financing")
@RequiredArgsConstructor
public class FinancingController {

    private final FinancingService financingService;

    @GetMapping("/options/{supplierId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<FinancingOptionResponse>> getOptions(@PathVariable UUID supplierId) {
        List<FinancingOptionResponse> options = financingService.generateFinancingOptions(supplierId);
        return ResponseEntity.ok(options);
    }

    @PostMapping("/accept/{offerId}")
    @PreAuthorize("hasRole('SUPPLIER')")
    public ResponseEntity<com.netcredix.jbackend.dto.FinancingOfferResponse> acceptOffer(@PathVariable UUID offerId) {
        com.netcredix.jbackend.dto.FinancingOfferResponse response = financingService.acceptOffer(offerId);
        return ResponseEntity.ok(response);
    }
}
