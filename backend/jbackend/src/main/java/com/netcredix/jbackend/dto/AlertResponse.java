package com.netcredix.jbackend.dto;

import com.netcredix.jbackend.model.AlertSeverity;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AlertResponse {
    private UUID id;
    private UUID companyId;
    private String message;
    private AlertSeverity severity;
    private LocalDateTime createdAt;
}
