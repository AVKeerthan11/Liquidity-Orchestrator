package com.netcredix.jbackend.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class CashFlowForecastResponse {
    private Double predictedShortfall;
    private Integer daysUntilShortfall;
    private Double confidence;
}
