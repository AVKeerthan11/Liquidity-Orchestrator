package com.netcredix.jbackend.dto;

import com.netcredix.jbackend.model.InvoiceStatus;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class InvoiceStatusRequest {

    @NotNull
    private InvoiceStatus status;
}
