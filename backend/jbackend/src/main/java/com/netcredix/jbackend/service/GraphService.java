package com.netcredix.jbackend.service;

import com.netcredix.jbackend.model.Invoice;
import com.netcredix.jbackend.model.InvoiceStatus;
import com.netcredix.jbackend.model.RiskScore;
import com.netcredix.jbackend.repository.InvoiceRepository;
import com.netcredix.jbackend.repository.RiskScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.neo4j.core.Neo4jClient;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;
import com.netcredix.jbackend.dto.CytoscapeResponse;
import com.netcredix.jbackend.dto.CytoscapeNode;
import com.netcredix.jbackend.dto.CytoscapeEdge;
import com.netcredix.jbackend.dto.FsriResponse;
import com.netcredix.jbackend.dto.FsriSupplier;

import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class GraphService {

    private final Neo4jClient neo4jClient;
    private final InvoiceRepository invoiceRepository;
    private final RiskScoreRepository riskScoreRepository;

    @Transactional(readOnly = true)
    public FsriResponse calculateFsriCascadeRisk(UUID buyerId) {
        List<Invoice> buyerInvoices = invoiceRepository.findByBuyerId(buyerId);

        long totalInvoicesNetwork = buyerInvoices.size();
        if (totalInvoicesNetwork == 0) {
            return FsriResponse.builder().totalNetworkValue(0.0).networkResilienceScore(100.0).suppliers(new ArrayList<>()).build();
        }

        double totalBuyerExposure = buyerInvoices.stream()
                .filter(i -> i.getStatus() == InvoiceStatus.PENDING || i.getStatus() == InvoiceStatus.OVERDUE)
                .map(i -> i.getAmount().doubleValue())
                .reduce(0.0, Double::sum);

        if (totalBuyerExposure == 0) {
             return FsriResponse.builder().totalNetworkValue(0.0).networkResilienceScore(100.0).suppliers(new ArrayList<>()).build();
        }

        Map<UUID, List<Invoice>> supplierToInvoices = buyerInvoices.stream()
                .collect(Collectors.groupingBy(i -> i.getSupplier().getId()));

        List<FsriSupplier> suppliersList = new ArrayList<>();

        for (Map.Entry<UUID, List<Invoice>> entry : supplierToInvoices.entrySet()) {
            UUID supplierId = entry.getKey();
            List<Invoice> supplierInvoices = entry.getValue();
            
            String supplierName = supplierInvoices.get(0).getSupplier().getName();
            
            double directLoss = supplierInvoices.stream()
                .filter(i -> i.getStatus() == InvoiceStatus.PENDING || i.getStatus() == InvoiceStatus.OVERDUE)
                .map(i -> i.getAmount().doubleValue())
                .reduce(0.0, Double::sum);

            double fsriScore = (directLoss / totalBuyerExposure) * 100.0;
            
            double centralityScore = ((double) supplierInvoices.size()) / totalInvoicesNetwork;
            
            double riskScoreVal = 0.0;
            Optional<RiskScore> rsOpt = riskScoreRepository.findFirstByCompanyIdOrderByCalculatedAtDesc(supplierId);
            if (rsOpt.isPresent()) {
                riskScoreVal = rsOpt.get().getScore().doubleValue();
            }
            
            String criticalityLevel = "LOW";
            if (fsriScore > 30) criticalityLevel = "CRITICAL";
            else if (fsriScore > 20) criticalityLevel = "HIGH";
            else if (fsriScore > 10) criticalityLevel = "MEDIUM";

            FsriSupplier s = FsriSupplier.builder()
                .supplierId(supplierId)
                .supplierName(supplierName)
                .fsriScore(fsriScore)
                .directLoss(directLoss)
                .centralityScore(centralityScore)
                .riskScore(riskScoreVal)
                .criticalityLevel(criticalityLevel)
                .build();
                
            suppliersList.add(s);
        }

        suppliersList.sort((a, b) -> Double.compare(b.getFsriScore(), a.getFsriScore()));

        double top3Sum = 0;
        int count = 0;
        for (int i = 0; i < suppliersList.size() && count < 3; i++) {
            top3Sum += suppliersList.get(i).getFsriScore();
            count++;
        }
        
        double nrs = 100.0;
        if (count > 0) {
            nrs = 100.0 - (top3Sum / 3.0);
        }
        
        return FsriResponse.builder()
            .totalNetworkValue(totalBuyerExposure)
            .networkResilienceScore(nrs)
            .suppliers(suppliersList)
            .build();
    }

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
        
        try {
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
        } catch (Exception e) {
            log.warn("=== NEO4J: getNetworkForCompany failed — returning empty graph. Cause: {}", e.getMessage());
            return CytoscapeResponse.builder()
                    .nodes(new java.util.ArrayList<>())
                    .edges(new java.util.ArrayList<>())
                    .build();
        }
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