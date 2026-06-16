# Stage 1: Build the JAR file inside Render
FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /app

# Copy the build configuration and source code
COPY pom.xml .
COPY src ./src

# Compile and package the application into a fat JAR
RUN mvn clean package -DskipTests

# Stage 2: Create the lightweight runtime environment
FROM eclipse-temurin:21-jdk
WORKDIR /app

# Copy the compiled JAR from Stage 1
COPY --from=build /app/target/jbackend-0.0.1-SNAPSHOT.jar app.jar

# Keep your teammate's custom port active
EXPOSE 8081

ENTRYPOINT ["java","-jar","app.jar"]
