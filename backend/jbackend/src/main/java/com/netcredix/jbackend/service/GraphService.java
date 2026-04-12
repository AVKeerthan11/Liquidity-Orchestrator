package com.netcredix.jbackend.service;

import com.netcredix.jbackend.model.Invoice;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.neo4j.core.Neo4jClient;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Collection;
import com.netcredix.jbackend.dto.CytoscapeResponse;
import com.netcredix.jbackend.dto.CytoscapeNode;
import com.netcredix.jbackend.dto.CytoscapeEdge;

@Service
@RequiredArgsConstructor
@Slf4j
public class GraphService {

    private final Neo4jClient neo4jClient;

    public void upsertSupplyRelationship(
            String supplierId, String supplierName, String supplierType,
            String buyerId, String buyerName, String buyerType,
            String invoiceId, String invoiceAmount, String dueDate, String status) {
        try {
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
                    "name", supplierName,
                    "type", supplierType
            )).run();
            log.info("=== NEO4J: Supplier node result: {}", r1);

            // MERGE buyer node
            var r2 = neo4jClient.query(
                    "MERGE (b:Company {id: $id}) " +
                    "ON CREATE SET b.name = $name, b.type = $type, b.riskScore = 0.0 " +
                    "ON MATCH SET b.name = $name, b.type = $type"
            ).bindAll(Map.of(
                    "id",   buyerId,
                    "name", buyerName,
                    "type", buyerType
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
                    "invoiceId",  invoiceId,
                    "amount",     invoiceAmount,
                    "dueDate",    dueDate,
                    "status",     status
            )).run();
            log.info("=== NEO4J: Relationship result: {}", r3);

            log.info("=== NEO4J: Graph upsert COMPLETE!");

        } catch (Exception e) {
            log.error("=== NEO4J: FAILED - {}", e.getMessage(), e);
        }
    }

    public void updateCompanyRiskScore(String companyId, Double riskScore) {
        try {
            log.info("=== NEO4J: Updating risk score for company ID: {} to {}", companyId, riskScore);
            neo4jClient.query(
                    "MATCH (c:Company {id: $id}) " +
                    "SET c.riskScore = $riskScore"
            ).bindAll(Map.of(
                    "id", companyId,
                    "riskScore", riskScore
            )).run();
        } catch (Exception e) {
            log.error("=== NEO4J: FAILED updating risk score - {}", e.getMessage(), e);
        }
    }

    public CytoscapeResponse getNetworkForCompany(String companyId) {
        log.info("=== NEO4J: Fetching network for company ID: {}", companyId);
        
        Collection<Map<String, Object>> results = neo4jClient.query(
                "MATCH (c:Company {id: $id})-[r:SUPPLIES_TO]-(n:Company) " +
                "RETURN c, r, n"
        ).bindAll(Map.of("id", companyId)).fetch().all();

        java.util.Map<String, CytoscapeNode> nodeMap = new java.util.HashMap<>();
        java.util.Map<String, CytoscapeEdge> edgeMap = new java.util.HashMap<>();

        for (Map<String, Object> row : results) {
            try {
                Object cNode = row.get("c");
                Object nNode = row.get("n");
                Object rel = row.get("r");

                processGenericNode(cNode, nodeMap);
                processGenericNode(nNode, nodeMap);
                
                if (rel != null) {
                    String sourceId = getSourceId(rel, cNode, nNode);
                    String targetId = getTargetId(rel, cNode, nNode);
                    
                    String invoiceId = extractPropertyString(rel, "invoiceId");
                    if (invoiceId != null && !edgeMap.containsKey(invoiceId)) {
                        CytoscapeEdge edge = CytoscapeEdge.builder()
                                .data(CytoscapeEdge.EdgeData.builder()
                                        .source(sourceId)
                                        .target(targetId)
                                        .amount(extractPropertyDouble(rel, "invoiceAmount"))
                                        .status(extractPropertyString(rel, "status"))
                                        .build())
                                .build();
                        edgeMap.put(invoiceId, edge);
                    }
                }
            } catch (Exception e) {
                log.warn("=== NEO4J: Error parsing graph row - {}", e.getMessage());
            }
        }

        return CytoscapeResponse.builder()
                .nodes(new java.util.ArrayList<>(nodeMap.values()))
                .edges(new java.util.ArrayList<>(edgeMap.values()))
                .build();
    }

    private void processGenericNode(Object nodeObj, java.util.Map<String, CytoscapeNode> nodeMap) {
        if (nodeObj == null) return;
        String id = extractPropertyString(nodeObj, "id");
        if (id != null && !nodeMap.containsKey(id)) {
            CytoscapeNode cytoNode = CytoscapeNode.builder()
                    .data(CytoscapeNode.NodeData.builder()
                            .id(id)
                            .label(extractPropertyString(nodeObj, "name"))
                            .type(extractPropertyString(nodeObj, "type"))
                            .riskScore(extractPropertyDouble(nodeObj, "riskScore"))
                            .build())
                    .build();
            nodeMap.put(id, cytoNode);
        }
    }

    private String getSourceId(Object relObj, Object cNode, Object nNode) {
        try {
            if (relObj instanceof org.neo4j.driver.types.Relationship rel && cNode instanceof org.neo4j.driver.types.Node c) {
                if (rel.startNodeId() == c.id()) return extractPropertyString(cNode, "id");
                else return extractPropertyString(nNode, "id");
            }
        } catch (Exception ignored) {}
        return extractPropertyString(cNode, "id");
    }

    private String getTargetId(Object relObj, Object cNode, Object nNode) {
        try {
            if (relObj instanceof org.neo4j.driver.types.Relationship rel && cNode instanceof org.neo4j.driver.types.Node c) {
                if (rel.endNodeId() == c.id()) return extractPropertyString(cNode, "id");
                else return extractPropertyString(nNode, "id");
            }
        } catch (Exception ignored) {}
        return extractPropertyString(nNode, "id");
    }

    private String extractPropertyString(Object obj, String key) {
        if (obj == null) return null;
        try {
            if (obj instanceof java.util.Map map) {
                Object val = map.get(key);
                return val != null ? val.toString() : null;
            }
            if (obj instanceof org.neo4j.driver.types.Entity entity) {
                return entity.containsKey(key) && !entity.get(key).isNull() ? entity.get(key).asString() : null;
            }
        } catch (Exception ignored) {}
        return null;
    }

    private Double extractPropertyDouble(Object obj, String key) {
        if (obj == null) return 0.0;
        try {
            if (obj instanceof java.util.Map map) {
                Object val = map.get(key);
                if (val instanceof Number) return ((Number) val).doubleValue();
                return val != null ? Double.parseDouble(val.toString()) : 0.0;
            }
            if (obj instanceof org.neo4j.driver.types.Entity entity) {
                return entity.containsKey(key) && !entity.get(key).isNull() ? entity.get(key).asDouble() : 0.0;
            }
        } catch (Exception ignored) {}
        return 0.0;
    }
}