package com.netcredix.jbackend.dto;

import lombok.Builder;
import lombok.Data;
import java.util.UUID;

@Data
@Builder
public class ResearchComparisonResponse {
    private UUID companyId;
    private String companyName;
    private Double traditionalScore;
    private Double networkAwareScore;
    private Double difference;
    private Boolean underestimated;
    private String traditionalMethod;
    private String networkAwareMethod;
    private RiskFactors riskFactors;
    private String conclusion;
    private String paperReference;

    @Data
    @Builder
    public static class RiskFactors {
        private Double overdueRatio;
        private Double avgDelayDays;
        private Double neighborStress;
    }
}
