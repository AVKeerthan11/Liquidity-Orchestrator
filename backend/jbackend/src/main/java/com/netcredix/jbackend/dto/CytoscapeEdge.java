package com.netcredix.jbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class CytoscapeEdge {
    private EdgeData data;

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class EdgeData {
        private String source;
        private String target;
        private Double amount;
        private String status;
    }
}
