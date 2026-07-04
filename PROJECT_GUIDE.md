# Rwanda Criminal Intelligence Management System (IMS) v3.0
## Project Guide & Technical Reference

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Problem Statement](#2-problem-statement)
3. [Scope](#3-scope)
4. [Objectives](#4-objectives)
5. [How the System Works](#5-how-the-system-works)
6. [Key Stakeholders and Responsibilities](#6-key-stakeholders-and-responsibilities)
7. [Methodology](#7-methodology)
8. [Technology Stack](#8-technology-stack)
9. [Database Architecture](#9-database-architecture)
10. [Security and Legal Compliance](#10-security-and-legal-compliance)
11. [Deployment Architecture](#11-deployment-architecture)
12. [IoT-Based Predictive and Reactive Intelligence](#12-iot-based-predictive-and-reactive-intelligence)

---

## 1. Introduction

The Rwanda Criminal Intelligence Management System (IMS) version 3.0 is a unified, multi-institutional intelligence and identity verification platform built to modernize how Rwanda's security and justice institutions collect, share, and act on criminal intelligence.

Rwanda operates with a network of six distinct security and law enforcement institutions — the Rwanda National Police (RNP), the Rwanda Investigation Bureau (RIB), the Rwanda Defence Force (RDF), the National Intelligence and Security Service (NISS), the Rwanda Correctional Service (RCS), and community-level forces (Irondo and Dasso). Historically, each institution maintained its own isolated records. IMS v3.0 replaces that siloed approach with a single, role-governed intelligence backbone that all six institutions access simultaneously, each within the boundary of their legal authority.

The system introduces three major capabilities in version 3.0:

- **Digital Identity Verification (DIV)** — a mobile application that allows field officers to scan or manually enter a National ID number, or scan a citizen's face, and instantly check whether that person appears in the criminal intelligence database.
- **GPS Location Sharing** — when a criminal record is found during any verification check, the officer's current GPS coordinates are automatically captured and associated with the intelligence event, creating a real-time location trail.
- **Intelligence Source Attribution** — every intelligence event is permanently tagged with its exact origin method (camera node, face scan, NID scan, Interpol feed, officer report, etc.), making the full chain of intelligence traceable and auditable.

Beyond these core v3.0 capabilities, the system is architected around a fourth strategic pillar: **IoT-based Predictive and Reactive Intelligence**. A network of smart sensors, camera nodes, acoustic detectors, ANPR systems, and drone units feeds a continuous stream of environmental data into the platform. This data is processed by a predictive analytics engine that identifies crime-risk patterns before incidents occur, and by a reactive forensic engine that reconstructs events and locates perpetrators after crimes are committed. Section 12 of this document describes this layer in full detail.

This guide explains what the system solves, how it is structured, who uses it and how, and the technical foundations that make it function.

---

## 2. Problem Statement

Before IMS v3.0, Rwanda's security institutions faced a set of interconnected operational problems that reduced their collective effectiveness in preventing and responding to crime:

### 2.1 Siloed Intelligence
Each institution (RNP, RIB, RDF, RCS, NISS) maintained its own records in separate, non-communicating systems. A suspect arrested by RDF at a border post might be unknown to RNP officers at an urban checkpoint. Intelligence gathered by RIB during an investigation was invisible to RDF border officers who might encounter the same suspect crossing into Rwanda from the DRC.

### 2.2 No Real-Time Identity Verification in the Field
Field officers — patrol police, border soldiers, Irondo community patrol — had no digital tool to verify whether a person they encountered was a wanted suspect, active convict, or flagged by Interpol. Verification required radio calls back to headquarters, creating delays during which suspects could flee.

### 2.3 No Source Attribution on Intelligence Events
When an alert was raised or a record was flagged, it was often unclear whether the information came from a CCTV detection, an officer's manual report, an Interpol feed, or a cross-institutional query. Without source attribution, commanders could not properly assess the reliability of intelligence.

### 2.4 Location Data Not Tied to Criminal Encounters
When a wanted suspect was found at a specific location, this location data was rarely captured in a structured, searchable form. Movement patterns could not be reconstructed. Coordination between institutions responding to the same suspect lacked a shared location picture.

### 2.5 No Central Monitoring or Threat Detection
There was no automated mechanism to detect anomalous activity patterns — such as an officer querying hundreds of records in a short period, a camera node going offline, or repeated failed authentication attempts — that might indicate insider threats or system compromise.

### 2.6 Manual International Notice Handling
Interpol Red Notices and alerts from partner countries (Uganda, Kenya, DR Congo) were received manually and entered into separate logs. No automated linkage existed between an Interpol notice and the IMS suspect database.

IMS v3.0 directly addresses all six of these problems through an integrated architecture described in this document.

---

## 3. Scope

### 3.1 In Scope

| Area | Coverage |
|---|---|
| Institutions | NISS, RNP, RIB, RDF, RCS, Irondo, Dasso |
| Geography | Rwanda territory, including all 4 land borders (Gatuna, Rubavu, Rusizi, Nyagatare), Kigali International Airport, and urban checkpoints |
| Identity verification | National ID scan (OCR), NID manual entry, face recognition (ArcFace biometric) |
| Intelligence events | CCTV node detections, face scans, NID checks, officer reports, Interpol feeds, partner queries, system alerts |
| Suspect management | Creation, status tracking (WANTED, ACTIVE, IN_CUSTODY, CONVICTED, RELEASED, ARRESTED, INTERPOL_FLAGGED), warrant management, case linkage |
| Location intelligence | GPS capture on criminal record finds; location history per suspect (TOP SECRET access only) |
| Corrections integration | Inmate intake, pre-trial/sentenced status, escape reporting, release management |
| International partners | Interpol I-24/7 notice ingestion; bilateral queries with Uganda, Kenya, DR Congo |
| SIEM | Automated threat detection with 8 rule engine, auto-action triggers |
| Interfaces | Web application (browser-based), Flutter mobile app (Android/iOS), Raspberry Pi camera edge nodes |

### 3.2 Out of Scope

- The system does not store or process the full contents of the national identity registry (NIDA). It queries NIDA in real time and retains data only when a criminal record is found.
- Raw biometric images are never stored. Only 512-dimensional numerical face embeddings are retained.
- GPS location data from citizen encounters where no criminal record is found is immediately discarded and never persisted.
- International transmission of location data. All GPS records are stored on-premises in Rwanda and never transmitted outside national borders.
- Judicial case management (separate system operated by the Rwandan judiciary).

---

## 4. Objectives

### 4.1 General Objective

To build a unified, secure, multi-institutional criminal intelligence management system that enables Rwanda's security forces to share intelligence in real time, verify identities in the field, track criminal movements, and detect internal threats — all within a framework that respects Rwanda's data protection law and each institution's legal authority.

### 4.2 Specific Objectives

**SO1 — Digital Identity Verification in the Field**
Enable any authorized field officer to verify a person's identity against the criminal intelligence database within seconds, using either a physical NID card scan, a manually entered NID number, or a live face scan via mobile device.

**SO2 — Cross-Institutional Intelligence Sharing**
Ensure that intelligence collected by any institution (e.g., a CCTV detection by RDF at a border) is immediately visible to all other institutions with the appropriate clearance, eliminating the delay and information loss of manual inter-agency communication.

**SO3 — Source Attribution on Every Intelligence Event**
Tag every intelligence event at the moment of creation with its origin method — one of eight defined source tags — so that commanders, investigators, and auditors can always trace where a piece of intelligence came from.

**SO4 — Automatic GPS Capture on Criminal Record Finds**
Automatically record the GPS coordinates of the officer's location whenever a field verification reveals a criminal record, building a structured location history for wanted and active suspects.

**SO5 — Camera Network and Edge Node Integration**
Integrate Raspberry Pi 4 camera nodes deployed at border posts, airports, and urban checkpoints so that face matches detected by these nodes automatically create intelligence events and trigger alerts.

**SO6 — Corrections System Integration**
Give the Rwanda Correctional Service a real-time interface to manage inmate custody status, flag escapes with automatic cross-institutional alerts, and record releases — with automatic threat-level notifications when high-threat inmates are released.

**SO7 — Automated Security and Threat Detection (SIEM)**
Detect, log, and respond automatically to eight categories of suspicious system behaviour, including bulk data queries, off-hours access, repeated authentication failures, camera node offline events, and excessive location data access.

**SO8 — Role-Based Access with Zero Privilege Creep**
Enforce strict access control at every layer — application, API, and database — so that each user sees only the data their institution and role are legally authorized to access, with no possibility of privilege escalation through the API.

**SO9 — International Partner Integration**
Automate the ingestion of Interpol I-24/7 notices (Red, Orange, Blue, Green) and enable authorized NISS officers to submit and receive bilateral intelligence queries from partner countries within treaty boundaries.

**SO10 — Full Immutable Audit Trail**
Create a permanent, tamper-proof log of every data access, authentication event, and data modification, readable by NISS and SIEM analysts, and impossible to alter or delete by any user including system administrators.

---

## 5. How the System Works

### 5.1 System Overview

IMS v3.0 consists of five interconnected layers:

```
┌─────────────────────────────────────────────────────────┐
│                     USER INTERFACES                      │
│   Web App (Next.js)   │   Mobile App (Flutter)          │
│   Role-based dashboards per institution                  │
└──────────────────────────────┬──────────────────────────┘
                               │ HTTPS / JWT
┌──────────────────────────────▼──────────────────────────┐
│                    BACKEND API (FastAPI)                 │
│  Auth · Identity · Intelligence · Location · Admin      │
│  RBAC enforcement · RLS context injection               │
└──────────────────────────────┬──────────────────────────┘
                               │ asyncpg
┌──────────────────────────────▼──────────────────────────┐
│              DATABASE (PostgreSQL 16 + pgvector)        │
│  Row Level Security · Immutable audit log               │
│  Face embedding index · Encrypted PII columns           │
└──────────────────────────────┬──────────────────────────┘
                               │
┌─────────────────────────────┐│┌────────────────────────┐
│   SIEM ENGINE (Daemon)      │││  EDGE NODES (Pi 4)     │
│   8 detection rules         │││  InsightFace camera     │
│   Auto-action triggers      │││  Offline queue + mTLS  │
└─────────────────────────────┘│└────────────────────────┘
                               │ Redis pub-sub
                         Real-time alerts
```

### 5.2 Authentication Flow

1. Officer opens the web or mobile app and enters their **badge number**, **password**, and a **6-digit TOTP code** from their authenticator app.
2. The backend verifies the password hash (bcrypt), then verifies the TOTP code (RFC 6238). Both must pass — neither alone grants access.
3. On success, the backend issues a **JWT access token** (15-minute expiry) and a **refresh token** (7-day expiry). The JWT carries the officer's `institution`, `role`, `clearance_level`, and `session_id` as claims.
4. Every subsequent API request carries this JWT in the `Authorization: Bearer` header.
5. The backend middleware reads the JWT and injects `app.current_institution`, `app.current_role`, and `app.current_clearance` as PostgreSQL session variables before the database query executes. This activates Row Level Security policies.

### 5.3 Digital Identity Verification (DIV) — Field Check Flow

```
Officer encounters a person in the field
           │
           ▼
    Choose method:
    ┌────────────┬──────────────┬────────────┐
    │  NID Scan  │  NID Manual  │ Face Scan  │
    │  (OCR)     │  (type in)   │ (camera)   │
    └─────┬──────┴──────┬───────┴──────┬─────┘
          │             │              │
          ▼             ▼              ▼
    SHA-256 hash NID   SHA-256 hash  ArcFace
    (never plaintext)  NID           512-d embedding
          │             │              │
          └─────────────┴──────────────┘
                        │
                        ▼
           Query IMS suspect database
           (by NID hash or face embedding)
                        │
              ┌─────────┴─────────┐
              │                   │
         MATCH FOUND         NO MATCH
              │                   │
              ▼                   ▼
    ┌──────────────────┐   Query NIDA API (real-time)
    │ Criminal record  │   - If NIDA match: clean citizen
    │ confirmed        │   - citizen_data_retained = FALSE
    │                  │   - No data stored in IMS
    │ GPS captured     │
    │ Alert generated  │
    │ source_tag set   │
    │ Event created    │
    └──────────────────┘
```

### 5.4 Camera Edge Node Flow (Pi 4)

1. The Pi 4 runs `node_agent.py` at the border post or checkpoint. It processes every 5th camera frame to manage CPU load.
2. InsightFace (`buffalo_s` model for edge) extracts a 512-d face embedding from each detected face.
3. The node checks its local `EmbeddingCache` (suspect embeddings synced from the server) using cosine similarity. If confidence ≥ 0.70, it packages the detection.
4. The event is sent to the backend via mTLS-secured HTTPS. If the network is unavailable, the event is queued in a local JSONL file and replayed on next successful heartbeat.
5. The backend creates an `intelligence_event` with `source_tag = CCTV_NODE`, updates the camera node's last heartbeat, and pushes an alert through Redis pub-sub to all connected dashboard clients.

### 5.5 SIEM Threat Detection Flow

The SIEM engine runs as a separate Docker container. It polls the database every 60 seconds and evaluates eight detection rules:

| Rule | Trigger | Auto-Action |
|---|---|---|
| `BRUTE_FORCE` | ≥5 failed logins in 15 min | Lock user account |
| `MFA_BYPASS_ATTEMPT` | ≥3 consecutive MFA failures | Lock user + NISS alert |
| `BULK_ENUMERATION` | ≥50 suspect queries in 10 min | Rate limit + NISS alert |
| `OFF_HOURS_ACCESS` | Access 23:00–05:00 local time | Log + NISS alert |
| `LOCATION_OVERACCESS` | ≥10 location views in 1 hour | Kill session + NISS alert |
| `CAMERA_NODE_OFFLINE` | No heartbeat for 10 min | NISS alert + RDF alert |
| `REVOKED_ACCESS_ATTEMPT` | Revoked user attempts login | NISS alert |
| `UNUSUAL_CROSS_INST_ACCESS` | Institution accesses outside scope | Kill session + audit |

Triggered events are published to a Redis channel (`ims:niss:alerts`) and pushed to the NISS dashboard in real time.

### 5.6 Emergency Lockdown Flow

In an extreme security incident (e.g., suspected insider breach), NISS Directors can activate emergency lockdown:

1. NISS Director 1 initiates lockdown in the web dashboard, providing the UUID of NISS Director 2 and a documented reason.
2. The backend verifies both users hold the `NISS_DIRECTOR` role.
3. All active sessions for non-NISS users are immediately revoked in the database.
4. An audit record is created that is immutable and timestamped.
5. RNP, RIB, RDF, RCS, Irondo, and Dasso users must re-authenticate after lockdown is lifted.

### 5.7 Role-Based Dashboard Routing

When a user logs in, the system reads the `role` claim from their JWT and routes them to the dashboard built for their institution:

| JWT Role | Web Route | Mobile Screen |
|---|---|---|
| `NISS_DIRECTOR`, `NISS_OFFICER`, `SIEM_ANALYST` | `/niss` | NISS Command Center |
| `RNP_COMMANDER`, `RNP_DETECTIVE`, `RNP_PATROL` | `/rnp` | RNP Operations |
| `RIB_INVESTIGATOR`, `RIB_ANALYST` | `/rib` | RIB Investigations |
| `RDF_COMMANDER`, `RDF_BORDER_OFFICER` | `/rdf` | RDF Border Ops |
| `RCS_SUPERINTENDENT`, `RCS_OFFICER` | `/rcs` | RCS Custody |
| `IRONDO_PATROL`, `DASSO_OFFICER` | `/patrol` | Patrol Dashboard |

---

## 6. Key Stakeholders and Responsibilities

### 6.1 NISS — National Intelligence and Security Service

**Role in system:** Supreme oversight authority. NISS is the only institution with `TOP_SECRET` clearance and sees all data across all institutions.

**Responsibilities:**
- Monitor the Command Center dashboard for cross-institutional alerts and SIEM triggers
- Review and action all SIEM events within 24 hours
- Authorize international partner queries and receive partner responses
- Issue emergency lockdown when a security incident is confirmed (dual director authorization required)
- Access full GPS location history for any suspect
- Manage access revocations for any user across all institutions
- Review immutable audit log for compliance and investigation

**Key users:** NISS Directors (2), NISS Officers, SIEM Analyst

---

### 6.2 RNP — Rwanda National Police

**Role in system:** Primary field law enforcement. RNP officers use the DIV app most frequently for identity verification during patrols, checkpoint operations, and arrests.

**Responsibilities:**
- Conduct NID scans and face scans at urban checkpoints using the mobile DIV app
- Monitor wanted suspects list and active warrants
- Respond to CCTV node alerts from RNP-operated cameras (Nyabugogo, KGL-CBD, Musanze)
- Lead criminal investigations (case ownership) and coordinate with RIB
- Execute arrest warrants and update suspect status after arrest
- RNP Commanders: review cases by status and issue operational orders through the system

**Key users:** RNP Commanders, Detectives, Patrol Officers, System Administrator

**Data visible:** Wanted/active/arrested suspects (SECRET and below), warrants, cases they lead, RNP camera alerts, their own intelligence events

---

### 6.3 RIB — Rwanda Investigation Bureau

**Role in system:** Investigative authority. RIB manages complex criminal cases and has deeper access to intelligence histories for suspects on their cases.

**Responsibilities:**
- Manage criminal case files from investigation through prosecution
- Conduct face scans and NID verifications during investigations
- Submit and track intelligence events linked to cases under investigation
- Coordinate evidence and suspect intelligence with RNP and NISS
- RIB Analysts: produce intelligence assessments from aggregated events and case data
- Handle cybercrime, fraud, trafficking, and corruption cases

**Key users:** RIB Investigators, RIB Analysts

**Data visible:** Suspects linked to their cases, all intelligence events on case suspects, limited location data (only for suspects on assigned cases)

---

### 6.4 RDF — Rwanda Defence Force

**Role in system:** Border security. RDF operates all camera nodes at Rwanda's four land borders and monitors for cross-border criminal movement.

**Responsibilities:**
- Operate and monitor Raspberry Pi camera nodes at border posts (Gatuna, Rubavu, Rusizi, Nyagatare)
- Conduct face and NID verifications for persons entering/exiting Rwanda
- Monitor border CCTV detection alerts and respond to matches
- Coordinate with NISS on cross-border organized crime cases
- RDF Commanders: review border intelligence and manage border suspect profiles
- Report border incidents as officer-report intelligence events

**Key users:** RDF Commanders, Border Officers

**Data visible:** Suspects with cross-border profiles, CCTV events from RDF-operated nodes, border alerts, Pi camera live preview from edge nodes

---

### 6.5 RCS — Rwanda Correctional Service

**Role in system:** Custodial authority. RCS manages suspects once they enter the corrections system and is responsible for custody status accuracy.

**Responsibilities:**
- Maintain accurate custody records for all pre-trial and sentenced inmates
- Report escapes immediately through the system (auto-generates CRITICAL alert to RNP, NISS, RDF)
- Record and report inmate releases; system auto-alerts other institutions when high-threat inmates are released
- Conduct identity verification (NID/face) during inmate intake using the DIV app
- Update corrections records when court verdicts are received

**Key users:** RCS Superintendents, RCS Officers

**Data visible:** Suspects in their custody, corrections records, alerts relevant to their facilities

---

### 6.6 Irondo and Dasso — Community Security Forces

**Role in system:** First point of contact at community level. Irondo and Dasso have the most restricted access — they can verify identities but cannot see suspect profiles or location data.

**Responsibilities:**
- Use the DIV mobile app to check NIDs and faces of community members during community patrols
- Report suspicious individuals or incidents through the officer-report function
- Act as the eyes and ears at the community level, feeding intelligence events into the system from the ground

**Key users:** Irondo Patrol Officers, Dasso Officers

**Data visible:** Result of verification only (criminal record found: yes/no). No suspect names, profiles, locations, or case details.

---

### 6.7 System Administrator (SYSTEM_ADMIN)

**Role in system:** Technical operations. The System Administrator manages the infrastructure but has no access to intelligence content.

**Responsibilities:**
- Manage user accounts and MFA enrollment
- Monitor system health (camera nodes, API uptime, database)
- Manage access revocations as directed by NISS
- Perform system updates and maintenance within defined change windows

**Data visible:** System health, user account management only — no intelligence events, no suspect data, no location data

---

## 7. Methodology

### 7.1 Development Methodology

IMS v3.0 follows **Agile Scrum** with security-first design principles integrated into every sprint.

**Sprint structure:**
- 2-week sprints
- Sprint planning: feature backlog prioritized by operational impact and security risk
- Daily standups focused on blockers
- Sprint review: demonstration to institution representatives
- Sprint retrospective: security review of new code before merge

**Security-first development principles applied:**
- Threat modelling performed before each major feature is designed
- No feature merges without a security review checklist sign-off
- All database schema changes reviewed for RLS policy completeness
- All API endpoints reviewed for authentication and RBAC coverage before deployment

### 7.2 System Architecture Methodology

**Separation of concerns across layers:**
- The database enforces access control independently of the application (PostgreSQL RLS)
- The API enforces role-based permissions independently of the frontend (FastAPI RBAC dependency injection)
- The frontend enforces routing independently of the API (JWT role claim routing)

This means a compromise at one layer does not bypass controls at another.

**Privacy by design (Law No. 058/2021):**
- Data minimization: only the minimum data needed for each operation is collected and stored
- Purpose limitation: citizen PII collected during NID checks is discarded immediately if no criminal record is found
- SHA-256 hashing: National ID numbers are never stored in plaintext anywhere in the system
- GPS data tied strictly to criminal record finds: no citizen location data without a criminal record trigger

### 7.3 Testing Methodology

All testing uses the fictional sample database included in the system (`database/seeds/`). No real citizen data is used at any point during development or testing.

**Testing layers:**
- Unit tests: individual functions (hash functions, TOTP verification, embedding similarity)
- Integration tests: API endpoints against the sample database (PostgreSQL + pgvector running in Docker)
- Role-based access tests: each role tested against all endpoints to verify RLS policies work correctly
- Edge case tests: offline Pi node queue, token refresh, TOTP window tolerance, escape alert cascade

**Sample test credentials (all fictional):**

| Role | Badge | Password | TOTP Secret |
|---|---|---|---|
| NISS Director | NISS-DIR-001 | IMS@Sample2026! | JBSWY3DPEHPK3PXP |
| RNP Patrol | RNP-PAT-006 | IMS@Sample2026! | JBSWY3DPEHPK3PXP |
| RDF Border | RDF-BRD-003 | IMS@Sample2026! | JBSWY3DPEHPK3PXP |
| Irondo Patrol | IRO-PAT-001 | IMS@Sample2026! | JBSWY3DPEHPK3PXP |

Add TOTP secret to Google Authenticator or Microsoft Authenticator to generate valid 6-digit codes.

---

## 8. Technology Stack

### 8.1 Backend

| Component | Technology | Purpose |
|---|---|---|
| API Framework | **FastAPI** (Python 3.11) | Async REST API, automatic OpenAPI docs |
| ORM | **SQLAlchemy 2.0 (async)** | Database models and query building |
| Database Driver | **asyncpg** | High-performance async PostgreSQL driver |
| Authentication | **JWT (HS256)** via `python-jose` | Stateless session tokens |
| MFA | **pyotp** (TOTP RFC 6238) | Time-based one-time passwords |
| Password Hashing | **bcrypt** via `passlib` | Secure password storage |
| Face Recognition | **InsightFace / ArcFace** | 512-dimensional face embeddings |
| NID Privacy | **hashlib SHA-256** | One-way hash of national ID numbers |
| Message Broker | **Redis 7** | Real-time alert pub-sub, session management |
| Background Tasks | **asyncio** periodic tasks | SIEM engine, heartbeat monitoring |
| HTTP Client | **httpx** | NIDA API and Interpol feed queries |

### 8.2 Database

| Component | Technology | Purpose |
|---|---|---|
| Primary Database | **PostgreSQL 16** | All structured data storage |
| Vector Extension | **pgvector** | 512-d face embedding storage and cosine similarity search |
| Crypto Extension | **pgcrypto** | bcrypt password hashing in seed data |
| Access Control | **Row Level Security (RLS)** | Institution and clearance-level data isolation |
| Indexing | **IVFFlat index** (pgvector) | Fast approximate nearest-neighbour face search |

### 8.3 Web Application

| Component | Technology | Purpose |
|---|---|---|
| Framework | **Next.js 14** (App Router) | Server-side rendering, file-based routing |
| Language | **TypeScript** | Type-safe frontend development |
| Styling | **Tailwind CSS** | Utility-first dark-theme styling |
| Charts | **Recharts** | Source distribution pie, case bar charts |
| Maps | **React Leaflet + Leaflet** | Location intelligence map |
| HTTP Client | **Axios** | API requests with JWT interceptor and token refresh |
| Cookie Storage | **js-cookie** | Secure JWT storage (httpOnly not used; SameSite=Strict) |
| Notifications | **react-hot-toast** | In-app alert toasts |
| Icons | **Lucide React** | UI iconography |

### 8.4 Mobile Application

| Component | Technology | Purpose |
|---|---|---|
| Framework | **Flutter 3.x** | Cross-platform Android/iOS from single codebase |
| Language | **Dart** | Flutter's native language |
| State Management | **Riverpod** | Async state, auth provider, API client provider |
| Navigation | **GoRouter** | Declarative routing with role-based redirect |
| Secure Storage | **flutter_secure_storage** | Encrypted JWT token storage (Android Keystore / iOS Keychain) |
| Biometric Auth | **local_auth** | Device fingerprint/face ID before network login |
| NID OCR | **google_mlkit_text_recognition** | Camera frame text extraction for NID scan |
| GPS | **geolocator** | Officer location capture on criminal record find |
| HTTP Client | **Dio** | API requests with JWT interceptor and refresh |
| Camera | **camera** | Front-camera face scan |

### 8.5 Edge Node (Raspberry Pi 4)

| Component | Technology | Purpose |
|---|---|---|
| Runtime | **Python 3.11** | Node agent script |
| Face Recognition | **InsightFace buffalo_s** | Lightweight ArcFace model for Pi 4 |
| Camera Interface | **Pi Camera Module / OpenCV** | Video capture loop |
| OCR (ANPR) | **EasyOCR** | Rwanda vehicle plate recognition |
| Offline Queue | **JSONL file** | Event persistence during network outage |
| Security | **mTLS certificates** | Mutual TLS for node-to-server communication |
| Embedding Cache | **NumPy arrays** | Local cosine similarity without network |

### 8.6 Infrastructure

| Component | Technology | Purpose |
|---|---|---|
| Containerization | **Docker + Docker Compose** | Service orchestration (DB, Redis, API, SIEM, Nginx) |
| Reverse Proxy | **Nginx** | TLS termination, API routing, rate limiting |
| Secret Management | **`.env` file** | Environment-based secrets (not committed to version control) |

---

## 9. Database Architecture

### 9.1 Database Type

**Relational database: PostgreSQL 16** with the `pgvector` extension for vector/embedding storage.

PostgreSQL was selected over alternatives for three specific reasons:
1. **Row Level Security (RLS)** — PostgreSQL's native RLS allows institution-scoped access to be enforced inside the database engine itself, not just in application code. A direct database connection with an unauthorized role cannot retrieve data from another institution.
2. **pgvector** — The `pgvector` extension adds a native `vector(512)` column type and the `<=>` cosine distance operator, enabling fast ANN (approximate nearest neighbour) face embedding search without a separate vector database.
3. **Trigger system** — PostgreSQL triggers enforce immutability of the audit log, auto-generate IMS reference numbers, and automatically create location records when a criminal record match is found.

### 9.2 Core Tables and Relationships

```
institutions
    │
    ├──► users (badge_number, role, clearance_level, institution_id)
    │        │
    │        ├──► user_sessions (JWT session tracking)
    │        └──► audit_log (immutable, every write operation)
    │
    ├──► suspects (face_embedding vector(512), national_id_hash, ims_reference)
    │        │
    │        ├──► intelligence_events (source_tag, criminal_record_found, location_lat/lng)
    │        │        │
    │        │        └──► location_records [TOP SECRET] (auto-created by trigger)
    │        │
    │        ├──► nid_verifications (citizen_data_retained = FALSE when no record)
    │        ├──► warrants
    │        ├──► case_suspects (many-to-many)
    │        └──► corrections_records (RCS data)
    │
    ├──► cases (case_reference, classification, lead_institution)
    │        └──► case_officers (many-to-many)
    │
    ├──► camera_nodes (node_identifier, last_heartbeat, is_active)
    ├──► alerts (severity, source_tag, requires_action)
    ├──► interpol_notices (notice_type, file_number, subject)
    ├──► international_partners (country_code, mou_active)
    │        └──► partner_queries (NISS only)
    ├──► watchlists + watchlist_entries
    ├──► siem_events (rule_name, severity, auto_action, reviewed)
    └──► access_revocations
```

### 9.3 Row Level Security — Access Matrix

| Table | NISS | RNP | RIB | RDF | RCS | Irondo/Dasso |
|---|---|---|---|---|---|---|
| suspects | All rows | WANTED/ACTIVE/ARRESTED | Case-linked only | Border-flagged only | IN_CUSTODY only | None |
| intelligence_events | All | Own events + CCTV alerts | Case-linked events | RDF-originated events | RCS events | Own events only |
| location_records | All | WANTED suspects only | Case suspects only | Border suspects only | None | None |
| cases | All | Cases they lead | Cases they investigate | Cases they hold | None | None |
| interpol_notices | All | Read-only | Read-only | Read-only | None | None |
| partner_queries | Full CRUD | None | None | None | None | None |
| siem_events | All | None | None | None | None | None |
| audit_log | Read all | Read own | Read own | Read own | Read own | Read own |

### 9.4 Data Privacy Protections in Schema

- `national_id_hash VARCHAR(64)` — SHA-256 hex digest only; no plaintext NID anywhere in the database
- `citizen_data_retained BOOLEAN DEFAULT FALSE` — always FALSE when no criminal record; the NID verification record stores outcome only, not citizen PII
- `face_embedding vector(512)` — 512 floating-point numbers; not a photograph; cannot be reverse-engineered into a face image
- `location_lat / location_lng` — populated in `intelligence_events` only when `criminal_record_found = TRUE`; the `create_location_record_on_match` trigger enforces this
- `prevent_audit_modification` trigger — raises PostgreSQL exception on any UPDATE or DELETE to `audit_log`; the audit is permanently immutable

---

## 10. Security and Legal Compliance

### 10.1 Legal Framework

This system is designed for compliance with:
- **Rwanda Law No. 058/2021** on Personal Data Protection — principles of data minimization, purpose limitation, and storage limitation are enforced in the schema and application code
- **Interpol Rules on the Processing of Data (RPD)** — Interpol notice data is handled within the I-24/7 framework; no re-transmission to non-member countries
- **Bilateral MOUs** — location data is never transmitted internationally; partner queries are NISS-only; Kenya and DR Congo queries limited to identity exchange only (no location sharing as Kenya MOU does not cover it)

### 10.2 Security Controls Summary

| Control | Implementation |
|---|---|
| Authentication | Badge + password (bcrypt) + TOTP (RFC 6238) — all three required |
| Authorization | JWT claims + FastAPI RBAC + PostgreSQL RLS (three independent layers) |
| Data in transit | HTTPS/TLS for all API traffic; mTLS for camera node connections |
| Data at rest | PostgreSQL encrypted volumes; `flutter_secure_storage` on mobile |
| Audit | Immutable PostgreSQL trigger-enforced audit log |
| NID privacy | SHA-256 one-way hash; plaintext NID discarded after hashing |
| Biometric privacy | 512-d embedding only; raw photo never stored |
| GPS privacy | Location captured only on criminal record find |
| Session management | JWT with 15-min access token; refresh token rotation |
| Brute force | SIEM `BRUTE_FORCE` rule + account lockout |
| Insider threat | SIEM `BULK_ENUMERATION`, `LOCATION_OVERACCESS`, `OFF_HOURS_ACCESS` rules |
| Camera node | mTLS certificates; node revocation list; offline queue with integrity |

---

## 11. Deployment Architecture

### 11.1 Docker Services

```
docker-compose up
    ├── ims_postgres    (PostgreSQL 16 + pgvector, port 5432)
    ├── ims_redis       (Redis 7, internal only)
    ├── ims_backend     (FastAPI, port 8000, depends on db + redis)
    ├── ims_siem        (SIEM daemon, no external port, depends on db + redis)
    └── ims_nginx       (Nginx, ports 80 + 443, reverse proxy to backend)
```

Seed data is loaded in strict order by Docker's `initdb` mechanism:
```
01_schema.sql → 02_rls.sql → 03_seed_roles.sql → 04_seed_users.sql
→ 05_seed_suspects.sql → 06_seed_cases.sql
→ 07_seed_infrastructure.sql → 08_seed_intelligence.sql
```

### 11.2 Quick Start (Development)

```bash
# 1. Copy environment variables
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET_KEY

# 2. Start all services
docker compose up -d

# 3. Verify backend is running
curl http://localhost:8000/health

# 4. Install web app dependencies and start
cd web && npm install && npm run dev
# Web app runs at http://localhost:3000

# 5. Build Flutter mobile app
cd mobile && flutter pub get && flutter run

# 6. Deploy edge node agent on Raspberry Pi
cd edge && pip install -r requirements.txt
python node_agent.py --node-id GTN-BORDER-01 --server https://ims.internal
```

### 11.3 Directory Structure

```
IMS/
├── database/
│   ├── schema.sql              # Full PostgreSQL schema
│   ├── rls_policies.sql        # Row Level Security policies
│   └── seeds/                  # Fictional sample data (8 files)
│       └── SAMPLE_DATA_REFERENCE.md
├── backend/
│   ├── app/
│   │   ├── api/v1/             # Endpoint modules (auth, identity, intelligence...)
│   │   ├── core/               # Security, RBAC, middleware
│   │   ├── models/             # SQLAlchemy ORM + Pydantic schemas
│   │   ├── services/           # Face recognition service
│   │   └── siem/               # SIEM rules engine + daemon
│   └── Dockerfile
├── mobile/
│   └── lib/
│       ├── core/               # Auth, API client, router
│       └── features/           # Dashboard screens (per institution) + DIV app
├── web/
│   └── src/
│       ├── app/
│       │   ├── (auth)/login/   # Login page
│       │   └── (dashboard)/    # Institution dashboards (niss, rnp, rib, rdf, rcs, patrol)
│       ├── components/         # Shared UI components
│       ├── hooks/              # useAuth, role detection
│       ├── lib/                # API client (typed)
│       └── types/              # TypeScript type definitions
├── edge/
│   ├── node_agent.py           # Raspberry Pi camera agent
│   └── utils/anpr.py           # Vehicle plate recognition
├── nginx/
│   └── nginx.conf              # Reverse proxy configuration
├── docker-compose.yml
├── .env.example
└── PROJECT_GUIDE.md            # This document
```

---

## 12. IoT-Based Predictive and Reactive Intelligence

This section describes the Internet of Things (IoT) layer of IMS v3.0 — the physical sensor network, the data pipelines it feeds, the predictive models that use that data to anticipate crimes before they happen, and the reactive forensic tools that help investigators locate and identify perpetrators after crimes are committed.

The IoT intelligence layer is built on a single principle: **passive, continuous environmental observation feeds active, targeted human response**. Officers are not replaced by sensors — they are directed more precisely by them.

---

### 12.1 The Core Problem IoT Solves

Traditional policing is largely **reactive**: a crime is reported, officers respond, an investigation begins. By the time response starts, the crime has already happened, the perpetrator may have fled, and physical evidence may be lost.

IoT-based intelligence shifts the model in two directions:

**Predictive direction (before the crime):**
The sensor network continuously monitors public spaces and known risk zones. When combinations of signals match historical patterns that precede criminal activity — unusual gatherings, known associates appearing together, vehicles loitering near past robbery locations at night — the system raises a pre-crime intelligence alert. Officers are deployed proactively to the area before an incident occurs.

**Reactive direction (after the crime):**
When a crime is reported, every sensor in the network becomes a forensic tool. The system reconstructs where a suspect was before, during, and after the event by pulling timestamped records from ANPR cameras, face recognition nodes, motion sensors, and acoustic detectors along the likely route. Investigators receive a ready-made timeline rather than starting from zero.

---

### 12.2 IoT Device Network

The physical layer of the IoT intelligence system consists of seven categories of device, each contributing a different data type to the intelligence picture.

#### 12.2.1 Smart Camera Nodes (Raspberry Pi 4 + ArcFace)

**What it is:** The existing Pi 4 camera nodes already deployed at borders, airports, bus terminals, and urban checkpoints (see Section 5.4).

**Predictive role:**
Beyond face identification, each camera node runs a **behaviour analytics module** alongside the ArcFace identification model. This module detects:
- **Loitering** — a person or group remaining in a location longer than a configurable threshold (default: 15 minutes) without clear purpose
- **Crowd formation anomaly** — sudden gathering of more than a threshold number of people in a short time window (possible flash mob robbery or public disorder)
- **Perimeter breach posture** — a person approaching a secure perimeter, stopping, scanning the area, and retreating (reconnaissance behaviour pattern)
- **Known associate co-location** — when two or more suspects from the IMS database appear in the same camera frame simultaneously, even if individually below the alert threshold

**Reactive role:**
When a crime is reported at or near a camera node's coverage zone, the node's timestamped detection log is immediately queried. The system pulls all face detections and behaviour events from a configurable window (default: 2 hours before the crime) and presents them as a structured timeline in the NISS and RNP investigation dashboards.

**Hardware:** Raspberry Pi 4 Model B (4 GB RAM), Pi Camera Module 3 (12 MP, autofocus), IP67-rated weatherproof housing, PoE (Power over Ethernet) for permanent installations, LTE backup for border posts.

---

#### 12.2.2 ANPR Network — Automatic Number Plate Recognition

**What it is:** Dedicated cameras at strategic road points that continuously read vehicle registration plates and compare them against the IMS vehicle watchlist.

**Locations in Rwanda:**
- All 4 land border posts (Gatuna, Rubavu, Rusizi, Nyagatare) — every vehicle entering or leaving
- Kigali International Airport road entrance
- Major highway toll points and urban entry/exit roads (Kigali: Kicukiro, Kimironko, Kanombe, Nzove)
- Bus terminal vehicle bays (Nyabugogo)

**Predictive role:**
- When a vehicle associated with a known suspect or a vehicle reported stolen is detected at a camera, an alert fires immediately with the location, direction of travel, and current time
- Patterns of repeated crossings — the same vehicle entering Rwanda from the DRC multiple times per week at odd hours — flag automatically as a smuggling or trafficking risk indicator
- Vehicles appearing on Interpol stolen vehicle notices trigger a CRITICAL alert and border lockdown recommendation

**Reactive role:**
- After a crime (robbery, hit-and-run, kidnapping), investigators query the ANPR network with a vehicle description or partial plate. The system returns every match across all cameras in the time window, with direction of travel, reconstructing the vehicle's route through Rwanda
- Even partial plates (e.g., 3 of 5 characters visible on a witness's phone video) are matched using fuzzy plate matching (Levenshtein distance ≤ 1 character)

**How it connects to IMS:**
ANPR events are stored as `intelligence_events` with `source_tag = CCTV_NODE` and a `vehicle_plate` field. The vehicle watchlist is a table in the IMS database managed by NISS and RNP.

**Hardware:** Dedicated ANPR cameras (e.g., Hikvision DS-2CD7A26G0/P-IZHS or similar), with dual IR illuminators for night reading. On-device OCR using EasyOCR (already implemented in `edge/utils/anpr.py`) running on a Pi 4 co-processor.

---

#### 12.2.3 Acoustic Gunshot Detection Sensors

**What it is:** IoT microphone arrays installed on streetlights, building rooftops, and border fence posts that listen continuously for the acoustic signature of gunshots, explosions, or glass-breaking. When a match is detected, the sensor transmits the event with GPS coordinates and timestamp to IMS within 1–3 seconds — faster than any human witness report.

**How it works:**
1. Each sensor unit contains a microphone array, embedded DSP (Digital Signal Processor), and LTE/4G modem.
2. The DSP continuously runs a lightweight classification model trained on gunshot, explosion, and glass-break audio signatures. Processing happens on-device — no raw audio is transmitted or stored.
3. When a signature match exceeds the confidence threshold (≥ 0.85), the sensor sends a JSON event payload to the IMS backend with: `sensor_id`, `event_type` (GUNSHOT / EXPLOSION / GLASS_BREAK), `confidence`, `gps_lat`, `gps_lng`, `timestamp_utc`.
4. The backend creates an `intelligence_event` with `source_tag = SYSTEM_ALERT`, severity `CRITICAL`, and triggers immediate alerts to the nearest RNP patrol unit and the NISS Command Center.
5. Because multiple sensors may detect the same event, a **triangulation engine** in the backend compares timestamps across nearby sensors and estimates the exact origin point of the sound (within 5–15 metre accuracy).

**Predictive role:**
Historical gunshot event data, when mapped spatially and temporally, reveals crime hotspot zones and high-risk time windows. The predictive model learns that certain intersections in Kigali have a statistically higher rate of firearm incidents on Friday nights after 22:00. Officers are pre-positioned in these zones on high-risk time windows.

**Reactive role:**
The moment a gunshot is detected, the system immediately pulls all face recognition events and ANPR reads from cameras within 500 metres of the acoustic sensor in the 10-minute window before the event. Investigators receive this pre-event intelligence package automatically within 30 seconds of the gunshot alert, before they even arrive at the scene.

**Hardware:** Specialty acoustic sensor units (e.g., ShotSpotter-style, or custom Pi 4 with high-sensitivity MEMS microphone array + DSP co-processor). Deployed on streetlight poles at 200–400 metre intervals in urban high-risk zones.

---

#### 12.2.4 Smart Border Perimeter Sensors

**What it is:** A network of low-power IoT sensors embedded along Rwanda's land borders between official crossing points to detect unauthorized crossings. This is specifically targeted at known smuggling corridors and the DRC/Burundi border zones where armed groups historically cross.

**Sensor types in the network:**

| Sensor Type | Detection | Placement |
|---|---|---|
| Passive Infrared (PIR) | Human/animal body heat movement | Every 50 metres along fence line |
| Vibration sensor | Fence cutting, climbing, digging | Fence wire and posts |
| Ground seismic sensor | Footfall patterns (human vs. animal discriminated by gait) | Buried 10 cm, every 100 metres |
| Microwave motion detector | Movement in cleared zone (50 m buffer zone) | Pole-mounted, cross-coverage |
| Covert camera (Pi Zero 2W) | Photo capture on sensor trigger | Camouflaged, solar-powered |

**How it works:**
1. Each sensor communicates over LoRaWAN (Long Range Wide Area Network) — a low-power wireless protocol ideal for remote, power-constrained environments. A LoRaWAN gateway at each border post covers a 10–15 km radius.
2. When a PIR + seismic sensor combination triggers simultaneously in the same zone (discriminating humans from wildlife with >90% accuracy), the covert camera fires and captures a photo.
3. If the photo contains a face, the Pi Zero node runs ArcFace embedding locally and transmits the embedding (not the photo) to IMS for matching.
4. RDF border officers receive an alert on their mobile dashboard showing: sensor zone, time, confidence that the motion is human, and face match result if available.

**Predictive role:**
- Recurring crossing patterns at specific sensor zones at specific times indicate a regular smuggling route. IMS flags these as `HIGH_RISK_CORRIDOR` zones and schedules targeted RDF patrols.
- Sensor activity that increases steadily over days before a known criminal operation is a pre-crime signal used to pre-position RDF units.

**Reactive role:**
- After a border incident, the full sensor event log for the relevant zone is pulled into the investigation timeline, showing exactly when and where a person crossed, their direction, and how many individuals were detected.

---

#### 12.2.5 Drone Surveillance Units

**What it is:** Autonomous and semi-autonomous drone units operated by RDF and RNP that provide aerial surveillance on demand, triggered either by a sensor alert or by officer request.

**Operating modes:**

**Mode 1 — Alert Response (automatic dispatch):**
When an acoustic sensor fires, a perimeter sensor triggers, or a CCTV node detects a known wanted suspect, the nearest available drone is automatically dispatched to the GPS coordinates of the event. The drone provides real-time aerial video to the responding officers' dashboards before they arrive on scene.

**Mode 2 — Scheduled Patrol:**
Based on the predictive hotspot model (Section 12.3), high-risk zones receive scheduled drone overflights during high-risk time windows. Each overflight is logged as an intelligence event. Any face or vehicle detected during the overflight is run through the IMS matching pipeline.

**Mode 3 — Pursuit Support:**
When a suspect flees on foot or by vehicle after a crime, an operator can manually task a drone to follow from the air. The drone streams GPS-tagged video to the RNP dashboard, and the system automatically creates a real-time location trail in the `location_records` table for any suspect the video confirms.

**How it connects to IMS:**
Drones communicate with the IMS backend over an encrypted 4G/LTE link. Video is processed on-drone (NVIDIA Jetson Nano co-processor) for face and plate detection; only detection events and embeddings are transmitted to the backend — not raw video. Raw video is stored locally on the drone's SD card and erased after 72 hours unless flagged for investigation.

**Hardware:** Medium-range quadcopter (e.g., DJI Matrice 300 RTK or locally sourced equivalent), thermal camera for night operations, NVIDIA Jetson Nano for edge inference, 45-min flight time, 15 km range.

---

#### 12.2.6 Smart Gate and RFID Readers (Correctional Facilities)

**What it is:** Electronic gates at RCS correctional facility entry and exit points fitted with RFID readers. Every inmate is issued a wristband with an embedded RFID chip. Every authorized visitor is issued a temporary RFID card. Every movement through every gate is logged to IMS in real time.

**How it works:**
1. Each gate swipe creates an `intelligence_event` with `source_tag = SYSTEM_ALERT` and event type `INMATE_MOVEMENT` or `VISITOR_ENTRY/EXIT`.
2. The system validates every gate event against the expected schedule. If an inmate's RFID is read at a gate they are not scheduled to pass (movement anomaly), an immediate alert fires to the RCS Superintendent and NISS.
3. If an RFID wristband is not read at the expected evening count gate by the expected time, the system automatically triggers the escape protocol — generating a CRITICAL alert to RNP, NISS, and RDF without waiting for a manual headcount discovery.

**Predictive role:**
Visitor patterns that deviate from normal (a previously unknown visitor appearing repeatedly before a scheduled high-risk inmate release, a visitor who arrived from a border town shortly before a planned prison gang action) are flagged as risk indicators by the anomaly detection engine.

**Reactive role:**
In an escape investigation, the RFID log provides a precise last-known gate event for the escaped inmate, narrowing the timeline of escape to minutes rather than hours.

---

#### 12.2.7 Environmental and Traffic IoT Sensors

**What it is:** General-purpose smart city sensors (already increasingly deployed in Kigali) integrated as a secondary data source — not the primary intelligence feed, but contextual enrichment.

**Data feeds integrated:**

| Sensor | Data Used For |
|---|---|
| Traffic flow counters | Identify unusual traffic patterns around a crime scene (sudden congestion = possible roadblock or incident) |
| Smart street lighting sensors | Lighting failures in a zone just before a crime are a common criminal tactic — sudden darkness flagged as pre-crime signal |
| Weather station sensors | Correlates weather (heavy rain, low visibility) with crime type distribution — some crime types spike in specific weather conditions |
| Mobile network tower activity (anonymized, via MNO agreement) | Unusual spike in mobile data usage or SIM card density in a specific cell tower sector can indicate crowd gathering |

---

### 12.3 Predictive Crime Intelligence Engine

The predictive engine is a background service that aggregates data from all IoT sources above and applies three analytical models to produce forward-looking intelligence: crime hotspot maps, suspect movement predictions, and criminal network graphs.

#### 12.3.1 Crime Hotspot Mapping

**How it works:**
The engine processes historical `intelligence_events` combined with IoT sensor event logs and applies a **Kernel Density Estimation (KDE)** algorithm to identify spatial concentrations of criminal activity. The output is a continuously updated heatmap that shows which geographic zones carry the highest crime risk at the current time.

The model accounts for:
- **Time of day** — crime density patterns differ between morning, afternoon, and night
- **Day of week** — weekend patterns differ significantly from weekday patterns
- **Season and weather** — visibility, temperature, and local event calendars
- **Recent intelligence events** — a known suspect sighted in an area raises that area's risk score for 24–48 hours
- **Historical recurrence** — some locations are chronic high-risk zones regardless of other factors

**Output:** A risk-scored GIS map updated every 15 minutes, visible on the NISS Command Center and RNP Operations dashboards. Grid zones are colour-coded:

| Colour | Risk Score | Recommended Action |
|---|---|---|
| Red | ≥ 0.80 | Active patrol deployment within 15 minutes |
| Orange | 0.60–0.79 | Increase patrol frequency, drone overflight |
| Yellow | 0.40–0.59 | Standard patrol, IoT sensor monitoring |
| Green | < 0.40 | Normal, no change to patrol |

**How it prevents crime:**
Officers are deployed to red zones before incidents occur. The visible presence of officers in predicted high-risk areas deters criminal activity and ensures rapid response time if an incident does begin.

---

#### 12.3.2 Suspect Movement Prediction

**How it works:**
For every active suspect in the IMS database with a status of WANTED, ACTIVE, or INTERPOL_FLAGGED, the engine maintains a **mobility model** — a probabilistic map of where the suspect is likely to be at any given time, based on:
- GPS location history from past criminal record find events
- Camera node detection history (where the suspect has been seen before)
- Known associates' movement patterns (if an associate was recently detected at a location, the suspect has elevated probability of being in the same area)
- Suspects' known home/work areas from their file
- Border crossing patterns (regular crossing times suggest a smuggling schedule)

**Output:** A list of top 3 predicted locations for each WANTED suspect, refreshed every hour. When a suspect's predicted location overlaps with a red zone on the hotspot map, the system generates a proactive intelligence alert: "Suspect X has 67% probability of being in Nyabugogo Bus Terminal between 18:00 and 20:00 today. Camera nodes KGL-BUSPARK-01/02 are active in this zone."

**How it helps find perpetrators:**
After a crime, investigators use the suspect movement model to narrow their search area. Instead of searching all of Kigali, they focus resources on the 2–3 zones the model rates as most probable for the suspect's current location.

---

#### 12.3.3 Criminal Network Graph Analysis

**How it works:**
Every relationship in the IMS database — case co-suspects, known associates, shared phone numbers (from officer reports), shared vehicles (from ANPR), shared locations (appearing together in camera node detections) — is modelled as a node-and-edge graph.

When a new crime occurs and a suspect is identified, the network graph is queried to find:
- First-degree associates (directly connected to the suspect)
- Second-degree associates (connected through a mutual contact)
- Groups with high betweenness centrality (the "connectors" who bridge separate criminal networks — these are often the highest-value intelligence targets)
- Associates who were recently detected near the crime scene or on the suspect's predicted route

**Output:** An interactive network graph on the NISS and RIB dashboards showing the web of connections around any suspect. Nodes are colour-coded by status (WANTED = red, ACTIVE = orange, IN_CUSTODY = blue). Thicker edges indicate stronger/more recent connection evidence.

**How it prevents crime:**
Intelligence analysts can identify criminal networks before all members have committed documented offences. A new individual appearing repeatedly in the network graph of a known crime group — but with no prior record — can be placed on a monitoring watchlist before they commit an offence.

**How it helps find perpetrators:**
After a crime, the network graph immediately surfaces the 5–10 individuals most likely to have been involved as collaborators. Each of these individuals' phones, vehicles, and locations are cross-checked against IoT sensor data from the crime time window.

---

### 12.4 Reactive Forensic Intelligence — Finding Perpetrators After a Crime

When a crime is reported, the system enters **forensic reconstruction mode** — an automated process that assembles all available IoT and intelligence data into a structured timeline for investigators.

#### Step 1 — Spatial Boundary Definition

The investigator enters the crime location and time in the IMS web dashboard. The system automatically defines a **search radius** (default 1 km, configurable) and a **time window** (default: from 2 hours before the crime to 1 hour after).

#### Step 2 — Multi-Source Evidence Aggregation

Within seconds, the system queries all available data sources simultaneously:

```
Crime reported at: Nyabugogo Bus Terminal, 2026-06-15 19:42
Search radius: 1 km  |  Time window: 17:42–20:42

Querying sources:
  ✔  Camera nodes in radius:       KGL-BUSPARK-01, KGL-BUSPARK-02, KGL-CBD-01
  ✔  ANPR cameras in radius:       KGL-BUSPARK-ENTRY, KIMIRONKO-ROAD-N
  ✔  Acoustic sensors in radius:   NYAB-ACOUSTIC-03, NYAB-ACOUSTIC-04
  ✔  PIR / motion sensors:         None in urban zone
  ✔  Intelligence events in DB:    All events within radius × window
  ✔  Patrol officer locations:     Officers logged as active in area

Results:
  Face detections:       23 individuals detected
  ─ IMS matches:         2 suspects (RWA-IMS-2024-00001, RWA-IMS-2025-00004)
  ─ Clean citizens:      21 (no record — data not retained)
  Vehicle plates read:   47
  ─ Watchlist matches:   1 (plate RAC-456-K, flagged stolen)
  Acoustic events:       1 (GUNSHOT, 19:44:32, triangulated to 8.4m accuracy)
  Intel events in DB:    3 (2 NID scans, 1 CCTV detection)
```

#### Step 3 — Automated Timeline Construction

The system constructs a chronological timeline of all events, sorted by timestamp, formatted for the investigator:

| Time | Source | Event | Location | Subject |
|---|---|---|---|---|
| 17:58 | CCTV_NODE / KGL-BUSPARK-01 | Face match — 96.2% confidence | Bus Bay 7 | RWA-IMS-2024-00001 (Alexis Mugisha, WANTED) |
| 18:11 | ANPR / BUSPARK-ENTRY | Vehicle detected — plate RAC-456-K (STOLEN) | Terminal entrance | — |
| 19:15 | CCTV_NODE / KGL-BUSPARK-02 | Behaviour: Loitering >15 min | Bus Bay 12 | RWA-IMS-2025-00004 (Eric Ndayambaje, WANTED) |
| 19:22 | NID_SCAN / RNP-PAT-006 | NID check — criminal record found | Terminal exit | RWA-IMS-2025-00004 — GPS captured |
| 19:44 | ACOUSTIC / NYAB-ACOUSTIC-03 | GUNSHOT detected — 89% confidence | 50m from Bus Bay 7 | — |
| 19:51 | CCTV_NODE / KGL-BUSPARK-01 | Face match — same individual — 94.8% | Terminal exit (running) | RWA-IMS-2024-00001 |
| 20:03 | ANPR / KIMIRONKO-ROAD-N | Stolen vehicle departing north | 1km from scene | Plate RAC-456-K |

#### Step 4 — Suspect Route Projection

Based on the last known ANPR read (20:03, heading north on Kimironko Road), the system:
- Projects the vehicle's likely route based on road network and speed
- Notifies all ANPR cameras along the projected route to flag the plate immediately
- Dispatches the nearest available drone to intercept the route
- Sends an alert to all RNP patrol officers in the northern Kigali zone

#### Step 5 — Investigator Report Package

The full timeline, face detection crops (not stored — queried live from node buffer), ANPR images, and acoustic triangulation map are packaged into an **evidence report** attached to the case file in IMS. Every item in the report carries its `source_tag`, confidence score, and the GPS coordinates of the detecting device — making all evidence court-admissible with clear chain of custody.

---

### 12.5 IoT Data Flow Architecture

```
PHYSICAL LAYER (IoT Devices)
─────────────────────────────────────────────────────────────────
 Pi Camera    ANPR Cam    Acoustic    PIR Fence    RFID Gate    Drone
 (ArcFace)    (OCR)       Sensor      Sensor       Reader       (Jetson)
    │             │           │           │             │           │
    └─────────────┴───────────┴───────────┴─────────────┴───────────┘
                                    │
                      Edge processing (on device):
                      - Face → embedding (not image)
                      - Plate → text string
                      - Audio → event type + confidence
                      - Motion → human/animal classification
                      - RFID → tag ID + timestamp
                                    │
                          mTLS encrypted HTTPS
                          (or LoRaWAN for remote sensors)
                                    │
INGESTION LAYER (FastAPI Backend)
─────────────────────────────────────────────────────────────────
                     /iot/events  endpoint
                    Authenticates node certificate
                    Validates payload schema
                    Writes intelligence_event to PostgreSQL
                    Publishes to Redis pub-sub channel
                                    │
                    ┌───────────────┴────────────────┐
                    │                                │
ANALYTICS LAYER                              ALERT LAYER
─────────────────────────────────────────────────────────────────
Predictive Engine               Redis → WebSocket → Dashboard
  ├─ KDE Hotspot model          ├─ NISS Command Center (all alerts)
  ├─ Suspect movement model     ├─ RNP Operations (patrol alerts)
  └─ Network graph engine       ├─ RDF Border (camera/perimeter)
                                └─ Mobile push (responding officers)
```

---

### 12.6 IoT-Specific Database Tables

The following tables extend the core IMS schema to support IoT intelligence:

| Table | Purpose |
|---|---|
| `iot_devices` | Registry of all physical IoT devices: type, serial number, GPS location, institution owner, TLS certificate hash, last heartbeat |
| `iot_events` | Raw IoT event log: device_id, event_type (FACE_DETECT / PLATE_READ / GUNSHOT / MOTION / RFID_SWIPE), payload_json, confidence, timestamp |
| `crime_hotspots` | KDE-generated risk scores per GIS grid cell, updated every 15 minutes; used to render the patrol risk map |
| `suspect_mobility_model` | Predicted location probabilities per WANTED/ACTIVE suspect; updated hourly by the predictive engine |
| `criminal_network_edges` | Graph edges between persons in the IMS database: source_person_id, target_person_id, edge_type (ASSOCIATE / CO_SUSPECT / SHARED_VEHICLE / CO_LOCATION), confidence, last_seen |
| `forensic_timelines` | Assembled event timelines per case; links to case_id, stores ordered list of event_ids from all sources |
| `acoustic_triangulations` | Multi-sensor gunshot triangulation results: sensor IDs used, origin lat/lng, accuracy_m, timestamp |

---

### 12.7 Privacy Boundaries in the IoT Layer

The IoT layer collects data about the physical environment — which inevitably includes ordinary citizens. The following boundaries ensure compliance with Law No. 058/2021:

| IoT Data Type | Retention Policy |
|---|---|
| Face embedding from camera node — NO IMS match | Discarded immediately. Not stored, not logged, not transmitted. |
| Face embedding from camera node — IMS match | Stored as `iot_event`, linked to `intelligence_event`. Embedding only — no image. |
| Vehicle plate — NOT on watchlist | Discarded immediately. Not stored. |
| Vehicle plate — ON watchlist | Stored as `iot_event` and `intelligence_event`. |
| Acoustic event (gunshot etc.) | Stored as `iot_event`. No audio recording kept. Event type + confidence + GPS only. |
| PIR / motion detection — human confirmed, NO face capture | Stored as `iot_event` with zone only. No personal identification. |
| RFID gate swipe — inmate/visitor | Stored as `iot_event`. Access log retained for 7 years per RCS policy. |
| Drone video — suspect confirmed present | Video retained for 72 hours, then deleted unless flagged for a specific case. |
| Drone video — no relevant person detected | Deleted within 24 hours. Never uploaded to central server. |
| Crime hotspot scores | Aggregated, anonymized — no personal data. Retained indefinitely for trend analysis. |
| Criminal network graph edges | Retained as long as the linked persons are in the IMS database. Deleted on suspect record deletion. |

**Key rule:** The IoT system does not build a database of innocent people's movements. It discards non-matching data at the earliest possible point — on the device, before transmission, whenever possible.

---

### 12.8 Summary — How IoT Changes the Crime Response Cycle

```
WITHOUT IoT:
Crime occurs → Reported by witness → Officers dispatched → Investigation begins from zero
Typical time to first lead: hours to days
Typical scene coverage: limited to what witnesses remember

WITH IoT (IMS v3.0 IoT layer):
Pre-crime signal detected → Officers pre-positioned → Crime deterred OR
Crime occurs → Acoustic sensor fires within 3 seconds → Forensic package assembled within 30 seconds
Officers arrive with: suspect face matches, vehicle plates, movement direction, suspect network
Typical time to first actionable lead: under 2 minutes
Scene coverage: every camera, sensor, and gate within 1 km, going back 2 hours
```

The combination of predictive positioning (officers where crime is about to happen) and reactive forensics (instant timeline assembly when it does happen) compresses the window in which a perpetrator can act without being identified and located.

---

*This document serves as the primary reference guide for the IMS v3.0 project. All sample credentials, suspect names, case references, and national ID numbers in this document and in the seed database are entirely fictional and created solely for development and testing purposes. No real citizen data is used at any stage of this project.*

---

**Document version:** 3.0.0  
**Last updated:** June 2026  
**Classification:** UNCLASSIFIED — Development Reference
