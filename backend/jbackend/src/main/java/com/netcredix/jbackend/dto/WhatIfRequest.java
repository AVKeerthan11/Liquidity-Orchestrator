package com.netcredix.jbackend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.UUID;

@Data
public class WhatIfRequest {

    // scenario field — accepts both "scenario" and "scenarioType" from frontend
    private String scenario;       // PAYMENT_DELAY | SUPPLIER_FAILURE (new field name)
    private String scenarioType;   // legacy alias — kept for backward compat

    private UUID targetCompanyId;  // the company being simulated

    private UUID buyerId;          // legacy: buyer context for buyer-perspective calls

    private UUID supplierId;       // legacy alias for targetCompanyId in SUPPLIER_FAILURE

    private Integer delayDays;     // required for PAYMENT_DELAY

    private UUID requestingCompanyId; // set by controller from JWT — the logged-in user's company

    /** Returns whichever scenario field is populated, normalised to upper case. */
    public String resolvedScenario() {
        String s = scenario != null ? scenario : scenarioType;
        return s != null ? s.toUpperCase() : null;
    }
}
