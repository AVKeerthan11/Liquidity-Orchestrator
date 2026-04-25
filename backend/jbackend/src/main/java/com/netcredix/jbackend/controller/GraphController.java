package com.netcredix.jbackend.controller;

import com.netcredix.jbackend.dto.CytoscapeResponse;
import com.netcredix.jbackend.dto.FsriResponse;
import com.netcredix.jbackend.service.GraphService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.UUID;

@RestController
@RequestMapping("/api/graph")
@RequiredArgsConstructor
public class GraphController {

    private final GraphService graphService;

    @GetMapping("/network/{companyId}")
    public ResponseEntity<CytoscapeResponse> getNetworkForCompany(@PathVariable String companyId) {
        return ResponseEntity.ok(graphService.getNetworkForCompany(companyId));
    }

    @GetMapping("/cascade-risk/{buyerId}")
    @PreAuthorize("hasRole('BUYER')")
    public ResponseEntity<FsriResponse> getCascadeRisk(@PathVariable UUID buyerId) {
        return ResponseEntity.ok(graphService.calculateFsriCascadeRisk(buyerId));
    }
}
