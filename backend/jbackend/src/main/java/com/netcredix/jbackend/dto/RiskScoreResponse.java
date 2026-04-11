package com.netcredix.jbackend.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public record RiskScoreResponse(
        UUID companyId,
        Double score,
        Severity severity,
        LocalDateTime calculatedAt
) {
}
