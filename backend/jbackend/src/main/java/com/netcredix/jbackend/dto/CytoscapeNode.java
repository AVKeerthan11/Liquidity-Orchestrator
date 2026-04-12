package com.netcredix.jbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class CytoscapeNode {
    private NodeData data;

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class NodeData {
        private String id;
        private String label;
        private String type;
        private Double riskScore;
    }
}
