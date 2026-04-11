package com.netcredix.jbackend.repository;

import com.netcredix.jbackend.model.CompanyNode;
import org.springframework.data.neo4j.repository.Neo4jRepository;
import org.springframework.data.neo4j.repository.query.Query;

import java.util.Optional;

public interface CompanyNodeRepository extends Neo4jRepository<CompanyNode, Long> {

    @Query("MATCH (c:Company {id: $id}) RETURN c")
    Optional<CompanyNode> findByCompanyId(String id);
}