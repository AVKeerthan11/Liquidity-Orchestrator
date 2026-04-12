package com.netcredix.jbackend.dto;

import com.netcredix.jbackend.model.FinancingType;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class FinancingOptionResponse {
    private FinancingType type;
    private BigDecimal originalAmount;
    private BigDecimal receivableAmount;
    private BigDecimal cost;
    private int speedDays;
    private BigDecimal probability;
    private BigDecimal routingScore;
    private boolean recommended;
}
