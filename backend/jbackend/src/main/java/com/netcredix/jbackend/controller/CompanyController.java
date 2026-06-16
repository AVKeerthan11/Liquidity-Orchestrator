package com.netcredix.jbackend.controller;

import com.netcredix.jbackend.dto.CompanyDTO;
import com.netcredix.jbackend.model.CompanyType;
import com.netcredix.jbackend.repository.CompanyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/companies")
@RequiredArgsConstructor
public class CompanyController {

    private final CompanyRepository companyRepository;

    @GetMapping("/buyers")
    public ResponseEntity<List<CompanyDTO>> getAllBuyers() {
        List<CompanyDTO> buyers = companyRepository.findByType(CompanyType.BUYER)
                .stream()
                .map(c -> new CompanyDTO(c.getId(), c.getName()))
                .collect(Collectors.toList());
        return ResponseEntity.ok(buyers);
    }
}
