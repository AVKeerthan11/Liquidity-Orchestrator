package com.netcredix.jbackend.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "risk_scores")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RiskScore {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(nullable = false)
    private Double score;

    @Column(name = "calculated_at", nullable = false)
    private LocalDateTime calculatedAt;
}
