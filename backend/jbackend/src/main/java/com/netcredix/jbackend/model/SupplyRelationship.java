package com.netcredix.jbackend.model;

import lombok.*;
import org.springframework.data.neo4j.core.schema.GeneratedValue;
import org.springframework.data.neo4j.core.schema.Id;
import org.springframework.data.neo4j.core.schema.RelationshipProperties;
import org.springframework.data.neo4j.core.schema.TargetNode;

import java.math.BigDecimal;
import java.time.LocalDate;

@RelationshipProperties
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SupplyRelationship {

    @Id
    @GeneratedValue
    private Long id;

    @TargetNode
    private CompanyNode buyer;

    private BigDecimal invoiceAmount;
    private LocalDate dueDate;
    private String status;
}
