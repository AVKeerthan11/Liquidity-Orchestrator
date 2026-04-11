package com.netcredix.jbackend.model;

import lombok.*;
import org.springframework.data.neo4j.core.schema.GeneratedValue;
import org.springframework.data.neo4j.core.schema.Id;
import org.springframework.data.neo4j.core.schema.Node;
import org.springframework.data.neo4j.core.schema.Property;

import java.util.UUID;

@Node("Company")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CompanyNode {

    @Id
    @GeneratedValue
    private Long neoId;

    @Property("id")
    private String id; // UUID as string (matches PostgreSQL company id)

    @Property("name")
    private String name;

    @Property("type")
    private String type;

    @Property("riskScore")
    private Double riskScore;
}
