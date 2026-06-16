package com.netcredix.jbackend.controller;

import com.netcredix.jbackend.dto.WhatIfRequest;
import com.netcredix.jbackend.dto.WhatIfResponse;
import com.netcredix.jbackend.model.User;
import com.netcredix.jbackend.repository.UserRepository;
import com.netcredix.jbackend.service.WhatIfService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/simulation")
@RequiredArgsConstructor
public class WhatIfController {

    private final WhatIfService  whatIfService;
    private final UserRepository userRepository;

    @PostMapping("/whatif")
    @PreAuthorize("hasAnyRole('SUPPLIER', 'BUYER', 'FINANCIER', 'ADMIN')")
    public ResponseEntity<WhatIfResponse> simulate(
            @RequestBody WhatIfRequest request,
            @AuthenticationPrincipal String email) {

        // Inject the logged-in user's companyId so the service knows who is requesting
        if (email != null && request.getRequestingCompanyId() == null) {
            userRepository.findByEmailWithCompany(email).ifPresent(user ->
                    request.setRequestingCompanyId(user.getCompany().getId()));
        }

        return ResponseEntity.ok(whatIfService.simulate(request));
    }

    /** Returns the distinct suppliers that have invoices with the given buyer. */
    @GetMapping("/buyer/{buyerId}/suppliers")
    @PreAuthorize("hasAnyRole('SUPPLIER', 'BUYER', 'FINANCIER', 'ADMIN')")
    public ResponseEntity<List<Map<String, String>>> getBuyerSuppliers(@PathVariable UUID buyerId) {
        return ResponseEntity.ok(whatIfService.getSuppliersForBuyer(buyerId));
    }
}
