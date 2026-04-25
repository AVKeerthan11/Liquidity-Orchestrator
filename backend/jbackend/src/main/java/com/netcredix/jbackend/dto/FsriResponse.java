package com.netcredix.jbackend.dto;

import lombok.Builder;
import lombok.Data;
import java.util.List;

@Data
@Builder
public class FsriResponse {
    private Double totalNetworkValue;
    private Double networkResilienceScore;
    private List<FsriSupplier> suppliers;
}
