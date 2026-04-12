package com.netcredix.jbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class CytoscapeResponse {
    private List<CytoscapeNode> nodes;
    private List<CytoscapeEdge> edges;
}
