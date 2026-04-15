package com.netcredix.jbackend.controller;

import com.netcredix.jbackend.dto.WhatIfRequest;
import com.netcredix.jbackend.dto.WhatIfResponse;
import com.netcredix.jbackend.service.WhatIfService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/simulation")
@RequiredArgsConstructor
public class WhatIfController {

    private final WhatIfService whatIfService;

    @PostMapping("/whatif")
    @PreAuthorize("hasAnyRole('BUYER', 'FINANCIER', 'ADMIN')")
    public ResponseEntity<WhatIfResponse> simulate(@Valid @RequestBody WhatIfRequest request) {
        return ResponseEntity.ok(whatIfService.simulate(request));
    }
}
