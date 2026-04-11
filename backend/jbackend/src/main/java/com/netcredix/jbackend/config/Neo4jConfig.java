package com.netcredix.jbackend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.neo4j.repository.config.EnableNeo4jRepositories;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@Configuration
@EnableNeo4jRepositories(
        basePackageClasses = com.netcredix.jbackend.repository.CompanyNodeRepository.class
)
public class Neo4jConfig {
}
