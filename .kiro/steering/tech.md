# Tech Stack

## Backend
- Language: Java 17
- Framework: Spring Boot 3.x
- Build Tool: Maven
- Key Dependencies:
  - Spring Web (REST APIs)
  - Spring Security + JWT (jjwt library)
  - Spring Data JPA + Hibernate (PostgreSQL)
  - Spring Data Neo4j (graph database)
  - Spring Scheduler (periodic jobs)
  - Lombok (reduce boilerplate)
  - Validation (input validation)

## Databases
- PostgreSQL (primary structured data)
- Neo4j (supply chain graph)
- Both connected via Spring Data

## ML Service
- Language: Python 3.10+
- Framework: FastAPI
- Libraries:
  - Prophet (cash flow forecasting)
  - XGBoost (risk scoring)
  - NetworkX (graph analytics)
  - Scikit-learn (preprocessing)
  - Pandas + NumPy (data manipulation)

## Frontend
- Framework: React 18 + Vite
- Styling: Tailwind CSS
- Charts: Recharts
- Graph Visualization: Cytoscape.js
- HTTP Client: Axios
- Routing: React Router

## Communication
- Backend to ML: HTTP REST calls
- Frontend to Backend: REST APIs
- Real-time: WebSocket

## Key Rules
- Always use DTOs for API request and response (never expose entities directly)
- Always validate all incoming requests
- Always handle exceptions with meaningful error messages
- Role based access: SUPPLIER, BUYER, FINANCIER, ADMIN
- JWT token based authentication (stateless)
- All monetary values stored as BigDecimal not double
- All dates stored as LocalDate or LocalDateTime