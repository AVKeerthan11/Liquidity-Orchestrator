package com.netcredix.jbackend.dto;

import com.netcredix.jbackend.model.FinancingStatus;
import com.netcredix.jbackend.model.FinancingType;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class FinancingOfferResponse {
    private UUID id;
    private UUID supplierId;
    private FinancingType type;
    private BigDecimal amount;
    private BigDecimal cost;
    private FinancingStatus status;
    private LocalDateTime createdAt;
}
