package com.netcredix.jbackend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class WhatIfRequest {

    @NotNull
    private UUID buyerId;

    @NotBlank
    private String scenarioType; // PAYMENT_DELAY | SUPPLIER_FAILURE

    private Integer delayDays;   // required for PAYMENT_DELAY

    private UUID supplierId;     // required for SUPPLIER_FAILURE
}
