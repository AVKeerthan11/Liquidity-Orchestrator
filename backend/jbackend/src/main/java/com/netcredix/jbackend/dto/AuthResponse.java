package com.netcredix.jbackend.dto;

import com.netcredix.jbackend.model.UserRole;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.UUID;

@Data
@AllArgsConstructor
public class AuthResponse {
    private String token;
    private UserRole role;
    private UUID companyId;
}
