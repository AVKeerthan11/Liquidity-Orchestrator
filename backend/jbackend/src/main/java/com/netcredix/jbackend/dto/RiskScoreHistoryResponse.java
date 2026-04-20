package com.netcredix.jbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class RiskScoreHistoryResponse {
    private Double score;
    private String calculatedAt; // ISO-8601 format
}
