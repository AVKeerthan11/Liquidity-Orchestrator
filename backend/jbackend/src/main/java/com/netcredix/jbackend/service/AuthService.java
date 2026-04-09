package com.netcredix.jbackend.service;

import com.netcredix.jbackend.dto.AuthResponse;
import com.netcredix.jbackend.dto.LoginRequest;
import com.netcredix.jbackend.dto.RegisterRequest;
import com.netcredix.jbackend.model.Company;
import com.netcredix.jbackend.model.CompanyType;
import com.netcredix.jbackend.model.User;
import com.netcredix.jbackend.model.UserRole;
import com.netcredix.jbackend.repository.CompanyRepository;
import com.netcredix.jbackend.repository.UserRepository;
import com.netcredix.jbackend.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final CompanyRepository companyRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    @Transactional
    public String register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email already registered");
        }
        if (companyRepository.existsByGstNumber(request.getGstNumber())) {
            throw new IllegalArgumentException("GST number already registered");
        }

        // ADMIN role doesn't map to a CompanyType, default to SUPPLIER for company
        CompanyType companyType = switch (request.getRole()) {
            case SUPPLIER -> CompanyType.SUPPLIER;
            case BUYER -> CompanyType.BUYER;
            case FINANCIER -> CompanyType.FINANCIER;
            case ADMIN -> CompanyType.SUPPLIER;
        };

        Company company = Company.builder()
                .name(request.getCompanyName())
                .gstNumber(request.getGstNumber())
                .type(companyType)
                .build();
        company = companyRepository.save(company);

        User user = User.builder()
                .company(company)
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .role(request.getRole())
                .build();
        userRepository.save(user);

        return "Registered successfully";
    }

    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("Invalid email or password");
        }

        String token = jwtUtil.generateToken(user.getEmail(), user.getRole().name());
        return new AuthResponse(token, user.getRole(), user.getCompany().getId());
    }
}
