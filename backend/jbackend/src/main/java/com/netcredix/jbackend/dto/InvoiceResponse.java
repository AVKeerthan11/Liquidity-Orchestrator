package com.netcredix.jbackend.dto;

import com.netcredix.jbackend.model.InvoiceStatus;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class InvoiceResponse {
    private UUID id;
    private UUID supplierId;
    private String supplierName;
    private UUID buyerId;
    private String buyerName;
    private BigDecimal amount;
    private LocalDate dueDate;
    private InvoiceStatus status;
    private LocalDateTime createdAt;
}
