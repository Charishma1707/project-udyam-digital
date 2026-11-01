# Airtel Business - Project Udyam Digital
# Data Preprocessing, Relational Schema & Docker Volume Persistence

This document details the data engineering, preprocessing pipeline, relational schema design, Docker containerization, and volume persistence strategy for the **Airtel Business - Project Udyam Digital** dataset.

---

## 1. Executive Summary & Architecture

The system processes and serves 4 primary data sources from `YTL_TrackA_Udyam_Digital_Data/`:

| Dataset / Table | Source File | Records | Primary Key | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`product_catalogue`** | `product_catalogue.csv` | **25** | `product_id` | Business connectivity, voice, cloud & IoT products with pricing, rules, and dependencies |
| **`gstin_registry`** | `mock_gstin_registry.csv` | **3,534** | `gstin` | Mock GSTIN registry for identity verification & business classification |
| **`udyam_registry`** | `mock_udyam_registry.csv` | **2,723** | `udyam_number` | Mock MSME Udyam registry for enterprise type, activity & location validation |
| **`smb_leads`** | `smb_leads.csv` | **5,000** | `lead_id` | Full quarter (Q1 2026) SMB sales funnel leads with stages, drop reasons, NPS, and spend |
| **Total Processed** | | **11,282** | | |

```
                       YTL_TrackA_Udyam_Digital_Data/
                     (CSV / Excel Source Datasets)
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │  Node.js Preprocessing &   │
                    │      ETL Pipeline         │
                    │(preprocessAndLoad.js)     │
                    └─────────────┬─────────────┘
                                  │
        ┌─────────────────────────┴─────────────────────────┐
        ▼                                                   ▼
┌─────────────────────────────────┐        ┌─────────────────────────────────┐
│     Docker PostgreSQL 16        │        │   Persistent In-Memory &        │
│  Container: airtel_postgres_db  │        │   JSON Fallback Cache           │
│  Volume: postgres_data          │        │   (data/summary.json)           │
│  (/var/lib/postgresql/data)     │        │   (Sub-millisecond lookups)     │
└─────────────────────────────────┘        └─────────────────────────────────┘
```

---

## 2. Preprocessing & Data Cleansing Rules

The ETL module (`node-src/db/preprocessAndLoad.js`) cleanses raw inputs using strict deterministic rules:

### A. String Trimming & Null Sanitization
- Whitespace is stripped from all text fields.
- Empty strings (`""`), whitespace-only strings, and `"null"` tokens are converted to SQL `NULL`.

### B. Boolean Coercion
- Flags such as `has_gstin`, `has_udyam`, `requires_gstin`, and `churned_within_6_months` are parsed into true boolean types (`BOOLEAN`):
  - Values `"Y"`, `"YES"`, `"TRUE"`, `"1"` $\rightarrow$ `true`
  - Values `"N"`, `"NO"`, `"FALSE"`, `""`, or missing $\rightarrow$ `false`

### C. Numeric & Currency Coercion
- Currency values (`price_min_inr_per_month`, `monthly_telecom_spend_inr`, `monthly_bundle_value_inr`, `acquisition_cost_inr`) are sanitized as `NUMERIC(10, 2)`.
- Headcounts and site metrics (`employee_count`, `num_sites`, `min_employees`, `min_sites`, `nps_score`) are parsed into `INTEGER` with `null` fallback.

### D. Date Parsing & ISO-8601 Formatting
- All event and registration dates (`created_date`, `registration_date`, `contacted_date`, `activated_date`) are validated to conform to `YYYY-MM-DD`.
- Unreached funnel dates (blank in dropped leads) are mapped to `NULL`.

### E. Identifier Integrity
- **GSTIN**: 15-character structure with valid checksum preserved without character loss (e.g., `32TTNXB7384T1ZW`).
- **Udyam Number**: Standard `UDYAM-XX-00-XXXXXXX` structure preserved (e.g., `UDYAM-KL-00-3078801`).

---

## 3. Relational Database Schema (PostgreSQL)

Located at `docker/init-db/01-init-tables.sql`:

```sql
-- 1. Product Catalogue
CREATE TABLE IF NOT EXISTS product_catalogue (
    product_id VARCHAR(10) PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    product_name VARCHAR(100) NOT NULL,
    description TEXT,
    unit VARCHAR(50),
    price_min_inr_per_month NUMERIC(10, 2),
    price_max_inr_per_month NUMERIC(10, 2),
    one_time_setup_inr NUMERIC(10, 2) DEFAULT 0,
    min_contract_months INTEGER DEFAULT 1,
    available_city_tiers VARCHAR(20),
    min_employees INTEGER DEFAULT 1,
    min_sites INTEGER DEFAULT 1,
    requires_gstin BOOLEAN DEFAULT FALSE,
    requires_one_of VARCHAR(100),
    typical_install_days INTEGER,
    target_segments VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Mock GSTIN Registry
CREATE TABLE IF NOT EXISTS gstin_registry (
    gstin VARCHAR(15) PRIMARY KEY,
    legal_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    constitution VARCHAR(100),
    principal_place_of_business TEXT,
    state VARCHAR(100),
    registration_date DATE,
    status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Mock Udyam Registry
CREATE TABLE IF NOT EXISTS udyam_registry (
    udyam_number VARCHAR(25) PRIMARY KEY,
    enterprise_name VARCHAR(255) NOT NULL,
    enterprise_type VARCHAR(50),
    major_activity VARCHAR(50),
    nic_description TEXT,
    state VARCHAR(100),
    city VARCHAR(100),
    date_of_registration DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. SMB Leads
CREATE TABLE IF NOT EXISTS smb_leads (
    lead_id VARCHAR(10) PRIMARY KEY,
    created_date DATE,
    lead_source VARCHAR(100),
    business_name VARCHAR(255),
    business_type VARCHAR(100),
    segment VARCHAR(100),
    city VARCHAR(100),
    city_tier INTEGER,
    state VARCHAR(100),
    preferred_language VARCHAR(50),
    employee_count INTEGER,
    num_sites INTEGER,
    annual_turnover_band VARCHAR(100),
    has_gstin BOOLEAN DEFAULT FALSE,
    gstin VARCHAR(15),
    has_udyam BOOLEAN DEFAULT FALSE,
    udyam_number VARCHAR(25),
    current_internet VARCHAR(100),
    current_provider VARCHAR(100),
    monthly_telecom_spend_inr NUMERIC(10, 2),
    products_of_interest VARCHAR(100),
    contact_name VARCHAR(100),
    contact_role VARCHAR(100),
    stage_reached VARCHAR(50),
    outcome VARCHAR(50),
    drop_reason TEXT,
    contacted_date DATE,
    needs_assessed_date DATE,
    quote_accepted_date DATE,
    kyc_complete_date DATE,
    activated_date DATE,
    days_lead_to_activation INTEGER,
    customer_follow_up_calls INTEGER DEFAULT 0,
    bundle_products VARCHAR(255),
    monthly_bundle_value_inr NUMERIC(10, 2),
    one_time_setup_inr NUMERIC(10, 2),
    contract_months INTEGER,
    churned_within_6_months BOOLEAN DEFAULT FALSE,
    nps_score INTEGER,
    acquisition_cost_inr NUMERIC(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_leads_city ON smb_leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_btype ON smb_leads(business_type);
CREATE INDEX IF NOT EXISTS idx_leads_gstin ON smb_leads(gstin);
CREATE INDEX IF NOT EXISTS idx_leads_udyam ON smb_leads(udyam_number);
CREATE INDEX IF NOT EXISTS idx_leads_outcome ON smb_leads(outcome);
CREATE INDEX IF NOT EXISTS idx_gstin_state ON gstin_registry(state);
CREATE INDEX IF NOT EXISTS idx_udyam_city ON udyam_registry(city);
```

---

## 4. Docker Containerization & Volume Persistence

The database and application are containerized using `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: airtel_udyam_postgres
    restart: always
    environment:
      POSTGRES_USER: ${DB_USER:-airtel_admin}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-airtel_secure_pass_2026}
      POSTGRES_DB: ${DB_NAME:-airtel_udyam_db}
    ports:
      - "${DB_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/init-db:/docker-entrypoint-initdb.d:ro
      - ./YTL_TrackA_Udyam_Digital_Data:/data:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-airtel_admin} -d ${DB_NAME:-airtel_udyam_db}"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: airtel_discovery_app
    restart: always
    ports:
      - "${PORT:-8000}:8000"
    environment:
      NODE_ENV: production
      PORT: 8000
      SARVAM_API_KEY: ${SARVAM_API_KEY}
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USER: ${DB_USER:-airtel_admin}
      DB_PASSWORD: ${DB_PASSWORD:-airtel_secure_pass_2026}
      DB_NAME: ${DB_NAME:-airtel_udyam_db}
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - app_persistent_data:/app/data

volumes:
  postgres_data:
    driver: local
  app_persistent_data:
    driver: local
```

### Volume Persistence Guarantee
- `postgres_data`: Docker named volume mapped directly to PostgreSQL's internal database directory `/var/lib/postgresql/data`.
- All tables, indexes, and seeded data persist indefinitely across container restarts, image rebuilds, and host reboots.

---

## 5. Running the Pipeline & Commands

### 1. Execute Preprocessing & Seed Database
```bash
npm run db:preprocess
```
*Parses all 11,282 CSV records, performs data cleansing, and loads into PostgreSQL and persistent cache in < 1 second.*

### 2. Launch Dockerized Stack with Volume Persistence
```bash
docker compose up -d
```
Starts:
1. `airtel_udyam_postgres` on port `5432` with volume `postgres_data`.
2. `airtel_discovery_app` on port `8000` with volume `app_persistent_data`.

### 3. Verify Database Status via API
- **Database Status:** `GET http://localhost:8000/api/database/status`
- **GSTIN Lookup:** `GET http://localhost:8000/api/lookup/gstin/32TTNXB7384T1ZW`
- **Udyam Lookup:** `GET http://localhost:8000/api/lookup/udyam/UDYAM-KL-00-3078801`
- **Product Catalogue:** `GET http://localhost:8000/api/products`

### 4. Run Automated Test Suite
```bash
npm test
```
Runs 16 unit and integration tests including schema validation, natural STT cleaner, deterministic planner, and complete database ETL / registry lookup tests.
