package com.netcredix.jbackend.service;

import com.netcredix.jbackend.model.Invoice;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.neo4j.core.Neo4jClient;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class GraphService {

    private final Neo4jClient neo4jClient;

    public void upsertSupplyRelationship(Invoice invoice) {
        try {
            String supplierId = invoice.getSupplier().getId().toString();
            String buyerId    = invoice.getBuyer().getId().toString();

            log.info("=== NEO4J: Starting graph upsert");
            log.info("=== NEO4J: Supplier ID: {}", supplierId);
            log.info("=== NEO4J: Buyer ID: {}", buyerId);

            // MERGE supplier node
            var r1 = neo4jClient.query(
                    "MERGE (s:Company {id: $id}) " +
                    "ON CREATE SET s.name = $name, s.type = $type, s.riskScore = 0.0 " +
                    "ON MATCH SET s.name = $name, s.type = $type"
            ).bindAll(Map.of(
                    "id",   supplierId,
                    "name", invoice.getSupplier().getName(),
                    "type", invoice.getSupplier().getType().name()
            )).run();
            log.info("=== NEO4J: Supplier node result: {}", r1);

            // MERGE buyer node
            var r2 = neo4jClient.query(
                    "MERGE (b:Company {id: $id}) " +
                    "ON CREATE SET b.name = $name, b.type = $type, b.riskScore = 0.0 " +
                    "ON MATCH SET b.name = $name, b.type = $type"
            ).bindAll(Map.of(
                    "id",   buyerId,
                    "name", invoice.getBuyer().getName(),
                    "type", invoice.getBuyer().getType().name()
            )).run();
            log.info("=== NEO4J: Buyer node result: {}", r2);

            // MERGE relationship
            var r3 = neo4jClient.query(
                    "MATCH (s:Company {id: $supplierId}), (b:Company {id: $buyerId}) " +
                    "MERGE (s)-[r:SUPPLIES_TO {invoiceId: $invoiceId}]->(b) " +
                    "SET r.invoiceAmount = $amount, r.dueDate = $dueDate, r.status = $status"
            ).bindAll(Map.of(
                    "supplierId", supplierId,
                    "buyerId",    buyerId,
                    "invoiceId",  invoice.getId().toString(),
                    "amount",     invoice.getAmount().toPlainString(),
                    "dueDate",    invoice.getDueDate().toString(),
                    "status",     invoice.getStatus().name()
            )).run();
            log.info("=== NEO4J: Relationship result: {}", r3);

            log.info("=== NEO4J: Graph upsert COMPLETE!");

        } catch (Exception e) {
            log.error("=== NEO4J: FAILED - {}", e.getMessage(), e);
        }
    }
}