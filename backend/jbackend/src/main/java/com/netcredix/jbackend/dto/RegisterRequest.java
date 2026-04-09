package com.netcredix.jbackend.dto;

import com.netcredix.jbackend.model.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class RegisterRequest {

    @NotBlank
    private String companyName;

    @NotBlank
    private String gstNumber;

    @NotNull
    private UserRole role;

    @NotBlank
    @Email
    private String email;

    @NotBlank
    private String password;
}
