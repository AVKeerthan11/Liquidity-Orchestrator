package com.netcredix.jbackend.dto;

import com.netcredix.jbackend.model.FinancingType;
import com.netcredix.jbackend.model.FinancingStatus;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
@Builder
public class FinancingOptionResponse {
    private UUID id;
    private FinancingType type;
    private FinancingStatus status;
    private BigDecimal originalAmount;
    private BigDecimal receivableAmount;
    private BigDecimal cost;
    private int speedDays;
    private BigDecimal probability;
    private BigDecimal routingScore;
    private boolean recommended;
    private UUID financierId;
    private String financierName;
}
