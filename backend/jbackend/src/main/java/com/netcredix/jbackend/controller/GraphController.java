package com.netcredix.jbackend.controller;

import com.netcredix.jbackend.dto.CytoscapeResponse;
import com.netcredix.jbackend.service.GraphService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/graph")
@RequiredArgsConstructor
public class GraphController {

    private final GraphService graphService;

    @GetMapping("/network/{companyId}")
    public ResponseEntity<CytoscapeResponse> getNetworkForCompany(@PathVariable String companyId) {
        return ResponseEntity.ok(graphService.getNetworkForCompany(companyId));
    }
}
