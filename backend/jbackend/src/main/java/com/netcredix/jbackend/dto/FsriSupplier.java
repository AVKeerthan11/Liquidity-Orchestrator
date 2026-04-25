package com.netcredix.jbackend.dto;

import lombok.Builder;
import lombok.Data;
import java.util.UUID;

@Data
@Builder
public class FsriSupplier {
    private UUID supplierId;
    private String supplierName;
    private Double fsriScore;
    private Double directLoss;
    private Double centralityScore;
    private Double riskScore;
    private String criticalityLevel;
}
