package com.netcredix.jbackend.repository;

import com.netcredix.jbackend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);

    @Query("SELECT u FROM User u JOIN FETCH u.company WHERE u.email = :email")
    Optional<User> findByEmailWithCompany(@org.springframework.data.repository.query.Param("email") String email);

    boolean existsByEmail(String email);
}
