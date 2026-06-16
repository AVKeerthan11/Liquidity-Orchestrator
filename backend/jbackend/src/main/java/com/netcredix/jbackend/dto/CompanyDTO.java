package com.netcredix.jbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.UUID;

@Data
@AllArgsConstructor
public class CompanyDTO {
    private UUID id;
    private String name;
}
