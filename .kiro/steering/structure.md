# Project Structure

## Repository
Name: Liquidity-Orchestrator
Group/Package: com.netcredix
Branches:
  - main: production ready only (protected, owner approval required)
  - dev: integration branch
  - feature/*: individual feature branches

## Actual Folder Structure
Liquidity-Orchestrator/
├── .github/
│   └── CODEOWNERS                         # Owner: AVKeerthan11
├── .kiro/
│   └── steering/                          # Kiro AI context files
│       ├── product.md
│       ├── tech.md
│       └── structure.md
├── backend/
│   └── jbackend/                          # Spring Boot application
│       ├── src/main/java/com/netcredix/jbackend/
│       │   ├── JbackendApplication.java   # Main entry point
│       │   ├── config/                    # Security, JWT config (empty)
│       │   ├── controller/                # REST controllers (empty)
│       │   ├── dto/                       # Request/Response objects (empty)
│       │   ├── model/                     # JPA + Neo4j entities (empty)
│       │   ├── repository/                # Spring Data repos (empty)
│       │   ├── security/                  # JWT filters (empty)
│       │   └── service/                   # Business logic (empty)
│       ├── src/main/resources/
│       │   └── application.properties     # App configuration
│       ├── src/test/
│       └── pom.xml                        # Maven dependencies
├── frontend/                              # React + Vite + TypeScript
│   ├── src/
│   │   ├── App.tsx                        # Root component
│   │   ├── main.tsx                       # Entry point
│   │   ├── assets/                        # Images, SVGs
│   │   ├── components/                    # Reusable UI components (empty)
│   │   ├── pages/                         # Full page components (empty)
│   │   ├── services/                      # Axios API calls (empty)
│   │   ├── store/                         # State management (empty)
│   │   └── types/                         # TypeScript types (empty)
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
└── README.md

## Backend Tech (pom.xml)
- Spring Boot: 4.0.5
- Java: 21
- Dependencies already added:
  - spring-boot-starter-data-jpa
  - spring-boot-starter-security
  - spring-boot-starter-validation
  - spring-boot-starter-webmvc
  - spring-boot-devtools
  - postgresql driver
  - lombok
- Dependencies still needed to add:
  - spring-boot-starter-data-neo4j
  - jjwt (JWT library)
  - spring-boot-starter-web (for WebSocket)

## Frontend Tech (package.json)
- React 19 + TypeScript
- Vite 8
- Tailwind CSS 4
- Axios
- React Router DOM 7
- React Hook Form
- Still needed:
  - recharts (charts)
  - cytoscape (graph visualization)
  - cytoscape-react (React wrapper)

## ML Service (not yet created)
- Location: ml-service/ (to be created at root level)
- Language: Python 3.10+
- Framework: FastAPI
- Libraries needed: prophet, xgboost, networkx, scikit-learn, pandas

## Database Schema (PostgreSQL - to be implemented)
- companies: id, name, gst_number, type (SUPPLIER/BUYER/FINANCIER), created_at
- users: id, company_id, email, password, role
- invoices: id, supplier_id, buyer_id, amount, due_date, status
- payments: id, invoice_id, amount_paid, paid_on, delay_days
- risk_scores: id, company_id, score, calculated_at
- financing_offers: id, supplier_id, type, amount, cost, status
- alerts: id, company_id, message, severity, created_at

## Neo4j Graph Schema (to be implemented)
- Node: Company {id, name, type, riskScore}
- Relationship: SUPPLIES_TO {invoiceAmount, dueDate, status}

## API Endpoints (to be implemented)
POST /api/auth/register
POST /api/auth/login
POST /api/invoices
GET  /api/invoices/company/{id}
GET  /api/graph/network/{companyId}
GET  /api/risk/score/{companyId}
GET  /api/financing/options/{supplierId}
POST /api/financing/accept/{offerId}
GET  /api/alerts/active/{companyId}
GET  /api/dashboard/supplier/{id}
GET  /api/dashboard/buyer/{id}
GET  /api/dashboard/financier/{id}
POST /api/simulation/whatif

## ML Service Endpoints (Python FastAPI - port 8000)
POST /predict/cashflow
POST /predict/risk
POST /simulate/contagion
POST /optimize/financing
POST /calculate/shapley

## Important Notes for Kiro
- Backend package name is com.netcredix.jbackend (NOT com.liquidity)
- Backend folder is backend/jbackend/ (NOT just backend/)
- Frontend uses TypeScript (.tsx files) NOT plain JavaScript
- Frontend uses Vite NOT Create React App
- All monetary values must use BigDecimal NOT double or float
- JWT secret and DB credentials must go in application.properties
- Never expose JPA entities directly in API responses, always use DTOs