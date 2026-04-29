# PulseGrid — Complete Project Blueprint

> **The world's first Rust-powered Universal Real-Time Automation & Intelligence Operating System**
> For individuals, developers, small businesses, and enterprises — used every day, by everyone.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [The Problem](#2-the-problem)
3. [The Solution](#3-the-solution)
4. [Target Audience](#4-target-audience)
5. [Unique Value Proposition](#5-unique-value-proposition)
6. [Technology Stack](#6-technology-stack)
7. [System Architecture](#7-system-architecture)
8. [Core Modules](#8-core-modules)
9. [Platform Surfaces](#9-platform-surfaces)
10. [Database Design](#10-database-design)
11. [API Design](#11-api-design)
12. [Security Architecture](#12-security-architecture)
13. [Infrastructure & DevOps](#13-infrastructure--devops)
14. [Revenue Model](#14-revenue-model)
15. [Monetization Strategy](#15-monetization-strategy)
16. [Go-To-Market Strategy](#16-go-to-market-strategy)
17. [Development Roadmap](#17-development-roadmap)
18. [Team Structure (Solo to Scale)](#18-team-structure-solo-to-scale)
19. [Competitive Analysis](#19-competitive-analysis)
20. [Risk Analysis](#20-risk-analysis)
21. [Success Metrics & KPIs](#21-success-metrics--kpis)
22. [Future Vision](#22-future-vision)
23. [Phase 1 Connector Capability Matrix (Live)](#23-phase-1-connector-capability-matrix-live)
24. [PulseGuard — AI Error Intelligence & Autonomous Maintenance Agent](#24-pulseguard--ai-error-intelligence--autonomous-maintenance-agent)

---

## 1. Project Overview

**Project Name:** PulseGrid  
**Tagline:** *The OS for everything you automate.*  
**Type:** Full-Stack SaaS Platform (Web + Mobile + API + CLI + Marketplace)  
**Core Engine Language:** Rust  
**Primary Model:** Freemium SaaS + Marketplace + API Billing  

PulseGrid is a universal real-time automation and intelligence platform. At its core sits **PulseCore** — a high-performance event processing engine written entirely in Rust — surrounded by a complete full-stack ecosystem: a Next.js web dashboard, an Angular enterprise admin panel, a NestJS API gateway, Spring Boot enterprise services, a Flutter mobile app, an embeddable Vue SDK, and a Rust-powered CLI.

Users connect any digital service, physical device, or data source to PulseGrid and build intelligent automations — called **Flows** — that respond in real time. A flow can be as simple as "send me a Telegram message when my server CPU exceeds 90%" or as complex as "when a new Shopify order comes in, check inventory levels, update the Airtable tracker, charge the customer via Stripe, assign a delivery driver via the logistics API, and post a Slack update to the fulfilment team."

PulseGrid runs in the background 24/7, silently automating the tedious, repetitive, and time-sensitive parts of people's lives and businesses — making it one of the few SaaS products that users genuinely rely on every single day.

---

## 2. The Problem

### 2.1 Fragmentation of Digital Life

The average person manages 25–35 apps on their phone and desktop. The average small business uses 40–75 SaaS tools. None of these talk to each other without expensive, brittle integrations. Every tool is a silo. The result:

- **Manual copy-paste work** that takes hours per week
- **Missed triggers** — important events nobody noticed
- **Delayed responses** — by the time a human acts, the moment has passed
- **Data scattered** across systems with no unified view

### 2.2 Existing Solutions Fall Short

Current automation tools (Zapier, Make, n8n, IFTTT) have critical limitations:

- **Too slow** — polling-based, not event-driven. Zapier checks triggers every 1–15 minutes.
- **Too expensive** — Zapier charges $50–$600/month for moderate usage
- **Too limited** — no real branching logic, no loops, no error handling, no state
- **No developer power** — can't write code, can't extend with custom logic
- **No AI** — no pattern learning, no suggestions, no natural language
- **No IoT/hardware** — limited or no support for smart home, sensors, wearables
- **No mobile-first** — no native apps, no push notifications, no home screen widgets

### 2.3 The Infrastructure Problem

Every existing automation platform runs on interpreted languages (Node.js, Python, Ruby). This means:

- High memory usage → high hosting costs
- High latency → slow trigger-to-action time (seconds, not milliseconds)
- Poor concurrency → limited throughput under load
- High operational cost passed on to users through high prices

### 2.4 The Privacy Problem

Every automation tool stores your API keys, passwords, and access tokens in plaintext or weakly encrypted databases. Users are one breach away from losing access to every service they've connected.

---

## 3. The Solution

PulseGrid solves every problem above with a single, unified platform:

### 3.1 PulseCore — The Rust Engine

A real-time event processing engine built in Rust using the Tokio async runtime. PulseCore:

- Processes events in **under 1 millisecond** (vs. 1–15 minutes for Zapier)
- Runs entirely on **real-time WebSocket/webhook streams**, not polling
- Executes automation rules in a **sandboxed Rust VM** — safe, fast, deterministic
- Consumes **10× less memory** than equivalent Node.js services
- Handles **millions of concurrent events** per second on modest hardware
- Exposes a **gRPC interface** for all other services to communicate with it

### 3.2 Universal Connectivity — ConnectHub

500+ pre-built connectors across:

- **Communication:** Gmail, Outlook, Slack, Teams, Telegram, WhatsApp, Discord
- **Business:** Salesforce, HubSpot, Shopify, Stripe, QuickBooks, Xero, Notion, Airtable
- **Developer:** GitHub, GitLab, Jira, Linear, PagerDuty, Datadog, AWS, GCP, Azure
- **Health & Fitness:** Apple Health, Google Fit, Fitbit, Oura, Garmin, Withings
- **Smart Home & IoT:** Matter, Zigbee, Z-Wave, Philips Hue, Home Assistant, MQTT
- **Finance:** Plaid (bank accounts), crypto APIs, stock market feeds
- **Social:** Twitter/X, Instagram, LinkedIn, YouTube, Reddit, TikTok
- **Custom:** Any REST API, GraphQL API, SQL database, or MQTT broker via JSON schema

### 3.3 AutoFlow — The Automation Builder

A visual drag-and-drop canvas where users build Flows:

- **Triggers:** Any event from any connector (or time-based, or manual)
- **Conditions:** If/else logic, comparisons, regex, AI classification
- **Actions:** Execute operations on any connected service
- **Loops:** Iterate over arrays, batch process records
- **Parallel branches:** Run multiple action paths simultaneously
- **Error handling:** Retry policies, fallback branches, dead-letter queues
- **Variables:** Store and transform data between steps
- **Sub-flows:** Reusable automation components

### 3.4 PulseAI — Intelligence Layer

An AI layer that makes PulseGrid proactive, not reactive:

- **Pattern recognition:** Watches event history and identifies recurring sequences
- **Flow suggestions:** "I noticed you manually do X every Monday — want me to automate it?"
- **Natural language builder:** Describe an automation in plain English → PulseAI writes the Flow
- **Anomaly detection:** Alert when something unusual happens in your data
- **On-device inference:** Uses ONNX Runtime via Rust (`tract` crate) for privacy-first ML

### 3.5 VaultGuard — Encrypted Credential Storage

Secure Key-Escrow and HSM-backed encrypted credential vault:

- All API keys, tokens, and passwords encrypted with AES-256-GCM before leaving the user's device.
- Enterprise-grade Hardware Security Module (HSM) and secure key-escrow system used to manage keys.
- Background execution engines (PulseCore) securely request delegated decryption keys from the escrow service to execute automated background flows, maintaining strict zero-knowledge properties external to the execution runtime.
- Implemented in Rust using the `ring` cryptography crate.

---

## 4. Target Audience

### 4.1 Individual Users (B2C)

| Persona | Use Case |
|---|---|
| Remote worker | Automate meeting notes → Notion, email summaries, calendar blocking |
| Health-conscious person | Sync wearable data, automate medication reminders, track habits |
| Personal finance tracker | Auto-categorize transactions, alert on budget overruns, generate reports |
| Content creator | Auto-post across platforms, track analytics, manage DMs |
| Smart home enthusiast | Automate lighting, security, energy usage, appliances |
| Student | Track deadlines, auto-remind, summarize lecture notes |
| Parent | Monitor screen time, automate chores tracker, family calendar sync |

### 4.2 Developers (B2D)

| Persona | Use Case |
|---|---|
| Backend developer | Monitor API health, trigger deploys, manage incident response |
| DevOps engineer | K8s alerts, auto-scale triggers, log pipeline automation |
| Indie hacker | Automate customer onboarding, usage alerts, revenue tracking |
| Data engineer | ETL pipelines, data quality checks, warehouse sync automation |
| Security engineer | Vulnerability scan triggers, alert routing, compliance automation |

### 4.3 Small & Medium Businesses (B2B-SMB)

| Industry | Use Case |
|---|---|
| E-commerce | Inventory alerts, order fulfilment flows, customer win-back campaigns |
| Healthcare | Appointment reminders, lab result routing, billing automation |
| Real estate | Lead routing, listing update alerts, document generation |
| Hospitality | Booking confirmations, review monitoring, staff scheduling |
| Legal | Deadline tracking, document automation, client communication |
| Marketing agency | Campaign performance alerts, report generation, client dashboards |

### 4.4 Enterprise (B2B-Enterprise)

Large organizations needing compliant, auditable, high-throughput automation at scale:

- Multi-tenant workspace isolation
- SSO/LDAP integration
- Compliance audit logs (SOC2, GDPR, HIPAA ready)
- On-premise deployment option
- SLA guarantees
- White-label capability

---

## 5. Unique Value Proposition

| Dimension | PulseGrid | Zapier | n8n | Make |
|---|---|---|---|---|
| Core engine | Rust (sub-ms) | Node.js (seconds) | Node.js (seconds) | PHP (seconds) |
| Trigger speed | Real-time | 1–15 minutes | Near real-time | 1–15 minutes |
| Mobile app | Full native (Flutter) | None | None | None |
| IoT/hardware support | Full (Matter, BLE, MQTT) | None | Limited | None |
| AI suggestions | Yes (on-device) | None | None | None |
| Credential security | Zero-knowledge E2E | Plaintext/weak enc | Self-hosted only | Plaintext/weak enc |
| Marketplace | Yes | No | No | No |
| CLI tool | Yes (Rust) | No | No | No |
| Embeddable SDK | Yes (Vue) | No | No | No |
| Code execution | Yes (Rust VM sandbox) | No | Yes (Node) | Limited |
| Self-hosted | Yes | No | Yes | No |
| Starting price | $0 | $0 (very limited) | $0 (self-hosted) | $0 (very limited) |

---

## 6. Technology Stack

### 6.1 Stack Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      PULSEGRID PLATFORM                     │
│                                                             │
│  ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Next.js  │ │Angular  │ │   Vue    │ │   Flutter      │  │
│  │Dashboard │ │Enterprise│ │Embed SDK │ │  Mobile Apps   │  │
│  └──────────┘ └─────────┘ └──────────┘ └────────────────┘  │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              NestJS — API Gateway                   │    │
│  │    REST · GraphQL · WebSocket · Webhook engine      │    │
│  └─────────────────────────────────────────────────────┘    │
│                       ▼                                     │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Spring Boot — Enterprise Services                 │     │
│  │  Billing · SSO · Compliance · Audit · Multi-tenant │     │
│  └────────────────────────────────────────────────────┘     │
│                       ▼                                     │
│  ┌────────────────────────────────────────────────────┐     │
│  │         PULSECORE — Rust Engine (gRPC)             │     │
│  │  Tokio · Event Bus · Rule VM · WebSocket Server    │     │
│  │  Pipeline Processor · Connector Runtime · CLI      │     │
│  └────────────────────────────────────────────────────┘     │
│                       ▼                                     │
│  ┌──────────┐ ┌───────────┐ ┌────────┐ ┌───────────────┐   │
│  │PostgreSQL│ │   Redis   │ │ClickH. │ │   RocksDB     │   │
│  │ Primary  │ │Cache/Queue│ │Analytic│ │  Local cache  │   │
│  └──────────┘ └───────────┘ └────────┘ └───────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Technology Decisions — Detailed

#### Rust (PulseCore Engine)

**Crates used:**
- `tokio` — async runtime for millions of concurrent connections
- `axum` — HTTP/WebSocket server framework
- `tonic` — gRPC server/client
- `serde` / `serde_json` — serialization
- `sqlx` — async PostgreSQL driver
- `redis` — async Redis client
- `ring` — cryptographic primitives (AES-256-GCM, Argon2id)
- `tract` — ONNX ML inference runtime
- `clap` — CLI argument parsing
- `tracing` — structured logging and distributed tracing
- `reqwest` — async HTTP client for connector calls
- `rocksdb` — embedded key-value store for local state cache
- `wasmtime` — WebAssembly runtime for user-defined custom code execution

**Why Rust for the core:**
The event engine must handle millions of concurrent events, evaluate complex rule trees in microseconds, manage encrypted credentials, and run user-submitted code safely in a sandbox. Rust's zero-cost abstractions, memory safety without garbage collection, and fearless concurrency make it the only viable choice. The resulting binary uses ~30 MB RAM under typical load vs. ~300 MB for equivalent Node.js. This directly translates to lower hosting costs and higher margins.

#### Next.js (Web Dashboard)

**Why Next.js:**
- Server-side rendering for fast initial paint (critical for dashboards)
- App Router for nested layouts per workspace
- API routes for BFF (backend-for-frontend) pattern
- Built-in image optimization and code splitting
- PWA support for offline-capable dashboard
- i18n routing for global expansion

**Key libraries:**
- `react-flow` — automation canvas (drag-and-drop flow builder)
- `recharts` — analytics charts
- `tanstack-query` — server state management
- `zustand` — client state management
- `socket.io-client` — real-time event feed
- `shadcn/ui` + `tailwindcss` — UI component system
- `framer-motion` — animations

#### NestJS (API Gateway)

**Why NestJS:**
Decorator-based architecture mirrors Spring Boot patterns (which you're also using), making the codebase consistent. NestJS has first-class support for microservices, gRPC clients, WebSocket gateways, and GraphQL — all needed in one gateway service.

**Key modules:**
- `@nestjs/microservices` — gRPC client to PulseCore
- `@nestjs/graphql` — GraphQL API with DataLoader for N+1 prevention
- `@nestjs/websockets` — real-time event relay to frontend
- `@nestjs/throttler` — rate limiting
- `passport` + `@nestjs/jwt` — authentication strategies
- `class-validator` — input validation
- `bull` — job queues (webhook delivery retries)

#### Spring Boot (Enterprise Services)

**Why Spring Boot:**
Enterprise customers require Java-ecosystem tooling: Spring Security for SSO/SAML/LDAP, Spring Data JPA for complex reporting queries, Spring Batch for large-scale data export jobs, and Actuator for health/metrics endpoints. Spring Boot's maturity and ecosystem make it the right choice for the billing, compliance, and multi-tenant administration layer.

**Key dependencies:**
- `spring-security` — OAuth2, SAML 2.0, LDAP
- `spring-data-jpa` — ORM for billing and audit entities
- `spring-batch` — data export pipeline jobs
- `stripe-java` — Stripe billing integration
- `jasperreports` — PDF report generation
- `spring-actuator` — health checks and metrics

#### Angular (Enterprise Admin)

**Why Angular:**
Enterprise admin portals have complex, deeply nested reactive forms — user/role management, workspace configuration, compliance policy editors. Angular's strict typing, powerful reactive forms (`ReactiveForms`), RxJS observables for real-time updates, and strong dependency injection make it ideal for this use case where form correctness matters more than raw development speed.

**Key libraries:**
- `@angular/material` — enterprise-grade UI components
- `ag-grid-angular` — large data grids for audit logs and user tables
- `ngx-charts` — billing and usage analytics charts
- `@ngrx/store` — centralized state management
- `rxjs` — reactive data streams

#### Vue.js (Embeddable SDK)

**Why Vue:**
Vue's `<script setup>` + Vite produces extremely small bundles. The embeddable SDK needs to load inside third-party apps without slowing them down. Vue's custom elements mode compiles components to native Web Components with Shadow DOM isolation — perfect for embedding in any website regardless of their tech stack.

**SDK capabilities:**
- Flow trigger widget (embed "Run automation" buttons in any app)
- Status widget (show automation run history inline)
- Configuration panel (let users configure automations from within a third-party app)
- All distributed as a single `pulsegrid-sdk.js` file under 20KB gzipped

#### Flutter (Mobile App — iOS + Android)

**Why Flutter:**
Single codebase for iOS and Android with native performance. Flutter's widget system allows pixel-perfect custom UI (the drag-and-drop flow canvas works on mobile via Flutter's gesture system). Dart's strong typing and Flutter's state management (Riverpod) make the codebase maintainable at scale.

**Key packages:**
- `riverpod` — state management
- `flutter_bloc` — BLoC pattern for complex flows
- `socket_io_client` — real-time event feed
- `flutter_blue_plus` — Bluetooth Low Energy for IoT device pairing
- `local_auth` — biometric authentication
- `flutter_local_notifications` — rich push notifications (daily digest, critical alerts)
- `home_widget` — iOS/Android home screen widget (event feed, flow health, quick-run)
- `flutter_ffi` — FFI bridge to Rust for on-device crypto operations
- `share_plus` — iOS share sheet + Android share extension (pipe any content into a Flow)
- `shorebird` — OTA code push for Flutter (ship fixes without App Store review)

#### Docker + Kubernetes

**Container strategy:**
Every service (PulseCore, NestJS API, Spring Boot, Next.js, PostgreSQL, Redis, ClickHouse) runs in its own Docker container with defined resource limits and health checks. Docker Compose is used for local development. Kubernetes (via Helm charts) manages production deployment.

**Free-tier start:**
- [Fly.io](https://fly.io) — PulseCore Rust binary (256MB RAM, free tier)
- [Railway](https://railway.app) — NestJS API Gateway
- [Render](https://render.com) — Next.js dashboard
- [Supabase](https://supabase.com) — PostgreSQL (free 500MB)
- [Upstash](https://upstash.com) — Redis (free serverless)
- [Cloudflare Pages](https://pages.cloudflare.com) — static assets / CDN

---

## 7. System Architecture

### 7.1 High-Level Architecture

```
                        ┌─────────────────┐
                        │   DNS / CDN     │
                        │  Cloudflare     │
                        └────────┬────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
    ┌─────────▼────────┐ ┌───────▼──────┐ ┌────────▼────────┐
    │  Next.js Dashboard│ │Angular Admin │ │  Mobile Apps    │
    │  (Vercel/Render)  │ │  (Static)    │ │  (App Stores)   │
    └─────────┬─────────┘ └──────┬───────┘ └────────┬────────┘
              │                  │                  │
              └──────────────────▼──────────────────┘
                                 │
                    ┌────────────▼───────────┐
                    │   NestJS API Gateway   │
                    │  (REST, GraphQL, WS)   │
                    │   auth · rate limit    │
                    │   webhook engine       │
                    └────────────┬───────────┘
                     ┌───────────┼────────────┐
                     │           │            │
          ┌──────────▼──┐  ┌─────▼─────┐  ┌──▼──────────┐
          │ Spring Boot  │  │PulseCore  │  │  ClickHouse │
          │  Enterprise  │  │(Rust gRPC)│  │  Analytics  │
          └──────────┬───┘  └─────┬─────┘  └─────────────┘
                     │            │
              ┌──────▼────┐  ┌────▼──────┐
              │PostgreSQL │  │   Redis   │
              │  Primary  │  │Cache/Queue│
              └───────────┘  └───────────┘
```

### 7.2 PulseCore Internal Architecture

```
EXTERNAL EVENTS
    │
    ▼
┌─────────────────────────────────────────────────────┐
│                  EVENT INGESTION LAYER               │
│  WebhookReceiver │ WebSocketListener │ SchedulerJob  │
│  MQTTBridge      │ BLEDeviceListener │ PollingWorker │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│               EVENT BUS (Redis Streams, Consumer Groups) │
│    Normalizes all events into PulseEvent struct       │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│               RULE EVALUATION ENGINE                 │
│  Loads user Flow definitions from PostgreSQL cache   │
│  Evaluates trigger conditions in Rust VM             │
│  Resolves data mappings and transformations          │
│  Returns ordered list of Actions to execute          │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│               ACTION EXECUTOR (Tokio tasks)          │
│  Parallel execution of independent action branches   │
│  Sequential execution of dependent action chains     │
│  Retry logic with exponential backoff                │
│  Dead-letter queue for failed actions (Redis)        │
│  Sandbox for user-submitted WASM code (wasmtime)     │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│               CONNECTOR RUNTIME                      │
│  Decrypts credentials from VaultGuard               │
│  Calls external APIs via reqwest (async HTTP)        │
│  Handles OAuth2 token refresh automatically          │
│  Emits connector results back to Event Bus           │
└──────────────────────────┬──────────────────────────┘
                           │
                    RESULTS / LOGS
                    PostgreSQL + ClickHouse
```

### 7.3 Data Flow — Single Automation Run

```
1. External event arrives (e.g. Shopify webhook: new order)
2. WebhookReceiver validates HMAC signature
3. Event normalized to PulseEvent { source, type, payload, tenant_id, timestamp }
4. Event published to Redis Streams (Durable, At-Least-Once)
5. Rule engine loads matching Flows for tenant_id
6. For each Flow: evaluate trigger conditions against payload
7. If matched: build ActionPlan (ordered graph of actions to execute)
8. ActionExecutor spawns Tokio tasks for each parallel branch
9. For each action: ConnectorRuntime decrypts credentials → calls external API
10. Results collected, output data mapped to next step inputs
11. Run log written to PostgreSQL (status, duration, error if any)
12. Aggregated stats written to ClickHouse
13. Real-time notification pushed via WebSocket to dashboard
```

### 7.4 Multi-Tenancy Model

Every resource in PulseGrid belongs to a **Workspace**. A workspace maps to:

- A unique `tenant_id` (UUID)
- Isolated PostgreSQL schema (schema-per-tenant for SMB/enterprise, shared schema for free/pro)
- Isolated Redis key namespace (`tenant:{id}:*`)
- Isolated ClickHouse partition
- Isolated PulseCore processing queue

Enterprise customers can optionally get a dedicated PulseCore instance for complete isolation.

---

## 8. Core Modules

### 8.1 PulseCore — Rust Real-Time Engine

**Repository:** `pulsegrid/core` (Rust workspace)  
**Deployment:** Docker container, Kubernetes Deployment, horizontal pod autoscale  
**Interface:** gRPC (Tonic) + WebSocket (Axum)

**Sub-crates:**
- `core-engine` — main event processing binary
- `core-vm` — Flow rule evaluation VM
- `core-connectors` — connector runtime (HTTP calls, OAuth)
- `core-vault` — VaultGuard cryptography module
- `core-cli` — `pulse` CLI tool
- `core-ai` — ONNX inference runtime (pattern detection)
- `core-proto` — shared Protobuf definitions

**Core data structures:**
```rust
pub struct PulseEvent {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub source: ConnectorId,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub received_at: DateTime<Utc>,
}

pub struct Flow {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub trigger: TriggerDefinition,
    pub steps: Vec<FlowStep>,
    pub error_policy: ErrorPolicy,
    pub enabled: bool,
}

pub struct FlowStep {
    pub id: StepId,
    pub connector: ConnectorId,
    pub action: ActionType,
    pub input_mapping: HashMap<String, DataExpression>,
    pub depends_on: Vec<StepId>,
    pub retry_policy: RetryPolicy,
}
```

### 8.2 ConnectHub — Integration Layer

**500+ connectors organized into categories:**

**Tier 1 — Free connectors (available on all plans):**
Gmail, Slack, Telegram, GitHub, Google Sheets, Notion, Airtable, HTTP (generic), Email (SMTP), RSS feed, Weather API, Time/Schedule, Webhooks (send/receive), Pushover, Discord

**Tier 2 — Pro connectors ($12/mo plan):**
Shopify, Stripe, HubSpot, Salesforce (basic), Twilio, SendGrid, WhatsApp Business, Linear, Jira, PagerDuty, Datadog, Cloudflare, AWS (S3/SQS/Lambda), Google Cloud, Plaid (banking), Fitbit, Apple Health sync

**Tier 3 — Business connectors ($49/mo plan):**
Salesforce (full), SAP, Oracle, QuickBooks, Xero, Workday, Zoom, DocuSign, Zendesk, Intercom, Marketo, Facebook Ads, Google Ads, TikTok Ads, LinkedIn, Full IoT suite (Zigbee, Z-Wave, Matter)

**Connector contract (Rust trait):**
```rust
#[async_trait]
pub trait Connector: Send + Sync {
    fn id(&self) -> ConnectorId;
    fn name(&self) -> &str;
    fn auth_method(&self) -> AuthMethod;
    async fn validate_credentials(&self, creds: &Credentials) -> Result<()>;
    async fn execute_action(&self, action: &Action, creds: &Credentials) -> Result<ActionOutput>;
    async fn verify_webhook(&self, request: &WebhookRequest) -> Result<PulseEvent>;
    fn supported_triggers(&self) -> Vec<TriggerDefinition>;
    fn supported_actions(&self) -> Vec<ActionDefinition>;
}
```

### 8.3 AutoFlow — Automation Builder

The visual automation canvas is a directed acyclic graph (DAG) where:

- **Nodes** are steps (triggers, conditions, actions, loops, parallel splits, merge points)
- **Edges** represent data flow between steps
- **Data expressions** are a mini-language for transforming data (`{{step1.output.email | lowercase}}`)

**Flow DSL (JSON stored in PostgreSQL):**
```json
{
  "id": "flow_abc123",
  "name": "New Shopify Order → Fulfilment",
  "trigger": {
    "connector": "shopify",
    "event": "order.created",
    "filters": [{ "field": "order.total_price", "op": "gt", "value": "0" }]
  },
  "steps": [
    {
      "id": "step_1",
      "type": "action",
      "connector": "airtable",
      "action": "create_record",
      "input": { "table": "Orders", "fields": { "OrderID": "{{trigger.id}}", "Total": "{{trigger.total_price}}" } }
    },
    {
      "id": "step_2",
      "type": "action",
      "connector": "slack",
      "action": "send_message",
      "input": { "channel": "#fulfilment", "text": "New order {{trigger.id}} for ${{trigger.total_price}}" },
      "depends_on": ["step_1"]
    }
  ],
  "error_policy": { "retry_count": 3, "retry_delay_seconds": 30, "on_failure": "notify_owner" }
}
```

**Advanced Flow features:**
- **Code steps:** Write and execute custom JavaScript/Python (compiled to WASM, run in wasmtime sandbox within Rust)
- **AI steps:** "Classify this text", "Summarize this email", "Extract entities" — calls PulseAI
- **Branch steps:** Conditional routing based on data values or AI classification output
- **Loop steps:** Iterate over arrays (process each line item of an order, each row of a spreadsheet)
- **Delay steps:** Wait for a specified duration or until a condition is met
- **Human-in-the-loop steps:** Pause and wait for manual approval before continuing

### 8.4 PulseAI — Intelligence Layer

**Components:**

**a) Pattern Detection Engine (Rust + ONNX)**
Runs as a background job in PulseCore. Analyzes each tenant's event history using a time-series pattern detection model. Identifies:
- Repeated manual actions (user does X then Y every weekday at 9am)
- Correlated events (event A is followed by manual action B within 10 minutes, 90% of the time)
- Anomalous events (spike in error rate, unusual login location, budget exceeded)

Model runs on-device using `tract` (ONNX runtime in Rust). No event data leaves the tenant's boundary for AI processing.

**b) Natural Language Flow Builder**
User types: *"Every Friday at 5pm, take my unread Gmail emails and create a summary document in Notion."*

PulseAI calls the LLM API (Claude/GPT-4) with a structured prompt that includes:
- The user's sentence
- Available connector schemas
- Flow DSL specification

LLM returns a valid Flow DSL JSON. PulseAI validates it, resolves ambiguities, and opens it in the AutoFlow canvas for the user to review before saving.

**c) Run Failure Analysis**
When a Flow fails, PulseAI analyzes the error log and suggests a plain-English fix: *"Your Shopify webhook secret has changed. Go to Shopify → Settings → Notifications and update the secret."*

**d) Usage Insights**
Weekly digest pushed to mobile: "Your automations saved you an estimated 3.2 hours this week. Your most-run flow was 'Gmail → Notion' (47 times)."

### 8.5 LivePulse Analytics

**Real-time streaming analytics powered by ClickHouse:**

**Metrics tracked per event:**
- Event source, type, timestamp
- Flow triggered (if any)
- Steps executed, duration per step
- Action outcomes (success/failure/retry)
- Connector API response times
- Data volume processed

**Dashboards available:**
- **Event explorer:** Real-time stream of all events, filterable by source/type/status
- **Flow performance:** Run counts, success rates, average duration, failure hotspots
- **Connector health:** API uptime, latency percentiles, error rates per connector
- **Business KPIs (for business/enterprise):** Revenue events, conversion rates, operational metrics
- **Usage billing:** API calls consumed, events processed (for billing transparency)

**ClickHouse schema (simplified):**
```sql
CREATE TABLE flow_runs (
    run_id UUID,
    tenant_id UUID,
    flow_id UUID,
    started_at DateTime64(3),
    duration_ms UInt32,
    status Enum('success', 'failure', 'partial', 'cancelled'),
    trigger_connector LowCardinality(String),
    steps_executed UInt8,
    error_message Nullable(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(started_at)
ORDER BY (tenant_id, started_at);
```

### 8.6 AutoMarket — Template Marketplace

A two-sided marketplace where:

**Sellers (creators) can:**
- Package any Flow as a template with a title, description, screenshots, and pricing
- Sell one-time templates ($1–$50) or subscriptions for template bundles
- Offer free templates to build reputation and drive followers
- Earn 70% of every sale (PulseGrid takes 30%)

**Buyers (users) can:**
- Browse by category (Business, DevOps, Personal, Health, Finance, Smart Home)
- Filter by connector (find all Shopify automations)
- One-click install — template installs into their workspace, then they fill in their own credentials
- Leave ratings and reviews
- Subscribe to creator's template library

**Trust & safety:**
- All templates reviewed for malicious code before publishing
- Sandboxed test runs during review
- Buyer protection: refund within 30 days if template doesn't work as described

### 8.7 VaultGuard — Credential Security

**Encryption architecture:**
```
User's master password (or SSO credentials)
        │
        ▼
Argon2id KDF (salt = user UUID + workspace UUID)
        │
        ▼
256-bit Master Key (wrapped and escrowed securely in backend HSM)
        │
        ▼
AES-256-GCM Encryption (nonce = random 96-bit per credential)
        │
        ▼
Encrypted credential blob stored in PostgreSQL
```

**Key properties:**
- Master key derived and escrowed securely via an enterprise-grade HSM (Hardware Security Module) to allow background execution without the user being online.
- Escrowed keys strictly accessible only to authenticated backend background workers executing specific flow runs.
- Credential rotation: when an OAuth token expires, PulseCore transparently decrypts using the escrowed key, refreshes, and re-encrypts the new token.
- Strict compliance via SOC2, HIPAA, and custom IAM tracking every decryption attempt.

### 8.8 Pulse CLI

A Rust CLI tool for developers and power users:

```bash
# Install
cargo install pulsegrid-cli
# or
brew install pulsegrid

# Authenticate
pulse auth login

# Create a flow from a file
pulse flow create --file ./my-flow.json

# Run a flow manually
pulse flow run --id flow_abc123

# Tail live events
pulse events tail --source github --type push

# Export all flows as backup
pulse flow export --format json --output ./backup/

# Import flows
pulse flow import --file ./backup/flows.json

# Test a connector
pulse connector test shopify

# View run logs
pulse runs list --flow flow_abc123 --limit 20

# Deploy a flow to a workspace
pulse flow deploy --workspace prod --file ./flow.json
```

---

## 9. Platform Surfaces

### 9.1 Web Dashboard (Next.js)

**Pages and features:**

| Page | Description |
|---|---|
| `/dashboard` | Overview: recent runs, event feed, quick stats, flow health |
| `/flows` | Flow list with search, filter, enable/disable toggle |
| `/flows/new` | AutoFlow canvas — drag-and-drop builder |
| `/flows/:id` | Flow detail — run history, performance metrics, edit |
| `/events` | Live event explorer — real-time stream with filters |
| `/connectors` | Installed connectors, add new, credential manager |
| `/analytics` | Full analytics dashboard — flow stats, connector health |
| `/market` | AutoMarket — browse and install templates |
| `/settings` | Workspace settings, team, billing, API keys |
| `/settings/vault` | VaultGuard — manage stored credentials |
| `/api-docs` | Interactive API documentation (Swagger + GraphQL playground) |

### 9.2 Enterprise Admin (Angular)

**Pages and features:**

| Page | Description |
|---|---|
| `/admin/workspaces` | All workspaces, usage stats, plan management |
| `/admin/users` | All users across workspaces, roles, last active |
| `/admin/billing` | Subscription management, invoices, usage breakdown |
| `/admin/audit` | Full audit log — every action by every user, exportable |
| `/admin/compliance` | GDPR data requests, SOC2 evidence export, HIPAA config |
| `/admin/sso` | SAML 2.0 / OIDC configuration, LDAP sync |
| `/admin/reports` | Custom reports with JasperReports PDF export |
| `/admin/connectors` | Allowlist/blocklist connectors for the organization |

### 9.3 Flutter Mobile App

**Screens:**
- **Home:** Smart feed — upcoming scheduled flows, recent important events, AI suggestions
- **Flows:** Full flow management (view, enable/disable, run manually)
- **Builder:** Simplified mobile flow builder for common use cases
- **Events:** Real-time event log with push notification settings
- **Analytics:** Mobile-optimized analytics charts
- **Devices:** IoT device management — scan BLE devices, configure Matter home devices
- **Market:** Browse and install templates
- **Settings:** Workspace, notifications, biometric auth, VaultGuard
- **Daily Digest:** Morning push notification with yesterday's automation summary; tapping opens a dedicated digest screen
- **Approvals:** Approve/reject human-in-the-loop flow pauses inline, with full context
- **Quick Triggers:** One-tap manual flow launcher, surfaced on the home screen and as a home screen widget
- **Alert Centre:** Critical failures and anomaly alerts with severity badges
- **Share Extension:** iOS share sheet + Android share target — pipe any content from any app directly into a PulseGrid Flow

**Home screen widgets (iOS/Android):**
- Mini event feed widget
- Flow health widget (green/red status indicators)
- Quick-run widget (one-tap trigger manual flows)

**OTA updates:**
Shorebird code push is integrated so critical fixes ship to users immediately without waiting for App Store or Google Play review cycles — without needing a second app.

### 9.4 Embeddable Vue SDK

For third-party developers to integrate PulseGrid into their apps:

```html
<!-- Install in any web app -->
<script src="https://cdn.pulsegrid.io/sdk/v1/pulsegrid-sdk.min.js"></script>

<!-- Show a "Run automation" button -->
<pulse-trigger flow-id="flow_abc123" label="Run daily report"></pulse-trigger>

<!-- Show automation status -->
<pulse-status flow-id="flow_abc123"></pulse-status>

<!-- Full automation management panel -->
<pulse-panel workspace-id="ws_xyz789" theme="light"></pulse-panel>
```

This allows Shopify app developers, Notion plugin builders, and any SaaS company to embed PulseGrid's power into their own product — with PulseGrid's branding or white-labeled.

### 9.5 Pulse CLI

Described in Module 8.8 above. Distributed as:
- Cargo install (`cargo install pulsegrid-cli`)
- Homebrew tap (`brew install pulsegrid`)
- GitHub releases binary (Linux, macOS, Windows)
- Docker image (`docker run pulsegrid/cli`)

---

## 10. Database Design

### 10.1 PostgreSQL — Primary Database

**Core tables:**

```sql
-- Tenants (workspaces)
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(20) NOT NULL DEFAULT 'free',
    owner_user_id UUID NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(320) UNIQUE NOT NULL,
    password_hash VARCHAR(255),  -- null for SSO-only users
    full_name VARCHAR(255),
    avatar_url TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workspace membership
CREATE TABLE workspace_members (
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member',  -- owner, admin, member, viewer
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

-- Flows
CREATE TABLE flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    definition JSONB NOT NULL,  -- Full Flow DSL
    enabled BOOLEAN DEFAULT TRUE,
    run_count BIGINT DEFAULT 0,
    last_run_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Encrypted credentials
CREATE TABLE credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    connector_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    encrypted_blob BYTEA NOT NULL,  -- AES-256-GCM encrypted
    nonce BYTEA NOT NULL,  -- 96-bit random nonce
    metadata JSONB DEFAULT '{}',  -- non-sensitive metadata (account name, scopes)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- Flow run logs
CREATE TABLE flow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID REFERENCES flows(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL,
    trigger_event_id UUID,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    duration_ms INT,
    steps_log JSONB,  -- per-step status, duration, error
    error_message TEXT
);

-- Marketplace templates
CREATE TABLE market_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_workspace_id UUID REFERENCES workspaces(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    flow_definition JSONB NOT NULL,
    price_cents INT NOT NULL DEFAULT 0,
    category VARCHAR(100),
    tags TEXT[],
    install_count INT DEFAULT 0,
    rating_avg DECIMAL(3,2),
    published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 10.2 Redis — Cache & Queue

**Key patterns:**
```
session:{token}                   → User session (TTL: 24h)
tenant:{id}:flows                 → Cached compiled flow definitions (TTL: 5min)
tenant:{id}:rate                  → Rate limiting counters
tenant:{id}:online                → Online presence (TTL: 30s, refreshed by heartbeat)
stream:events:{tenant_id}         → Redis Streams (Primary event broker, MAXLEN ~50,000, 7-day TTL)
group:consumer:{service}          → Consumer group tracking stream offsets and ACKs.
queue:actions:{priority}          → Bull job queues for pending actions
dlq:failed:{tenant_id}            → Dead letter queue for failed actions
ws:connections:{tenant_id}        → Active WebSocket connection IDs
oauth:pkce:{state}                → OAuth PKCE verifier (TTL: 10min)
```

### 10.3 ClickHouse — Analytics

All time-series analytics data goes to ClickHouse for fast OLAP queries:

```sql
-- Events received
CREATE TABLE events (
    event_id UUID,
    tenant_id UUID,
    connector LowCardinality(String),
    event_type LowCardinality(String),
    received_at DateTime64(3),
    payload_size_bytes UInt32
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(received_at)
ORDER BY (tenant_id, received_at, connector);

-- Flow run metrics
CREATE TABLE flow_run_metrics (
    run_id UUID,
    tenant_id UUID,
    flow_id UUID,
    started_at DateTime64(3),
    duration_ms UInt32,
    status LowCardinality(String),
    steps_count UInt8,
    failures_count UInt8
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(started_at)
ORDER BY (tenant_id, started_at);
```

---

## 11. API Design

### 11.1 REST API (NestJS)

Base URL: `https://api.pulsegrid.io/v1`

**Authentication:** Bearer JWT token (obtained via `/auth/login` or OAuth2)

**Key endpoints:**

```
POST   /auth/register           Register new user
POST   /auth/login              Get JWT tokens
POST   /auth/refresh            Refresh access token
POST   /auth/logout             Invalidate tokens

GET    /workspaces              List user's workspaces
POST   /workspaces              Create workspace
GET    /workspaces/:id          Get workspace details
PATCH  /workspaces/:id          Update workspace settings

GET    /flows                   List flows (paginated, filterable)
POST   /flows                   Create new flow
GET    /flows/:id               Get flow details + recent runs
PUT    /flows/:id               Replace flow definition
PATCH  /flows/:id               Update flow (name, enabled, etc.)
DELETE /flows/:id               Delete flow
POST   /flows/:id/run           Trigger manual run
GET    /flows/:id/runs          Get run history

GET    /connectors              List available connectors
GET    /connectors/:id          Connector schema (triggers, actions, auth)
GET    /credentials             List installed credentials
POST   /credentials             Store new credentials (encrypted client-side)
DELETE /credentials/:id         Remove credentials

GET    /events                  Query event history (paginated)
WS     /events/stream           WebSocket — real-time event stream

GET    /analytics/overview      Aggregate stats for workspace
GET    /analytics/flows         Flow performance metrics
GET    /analytics/connectors    Connector health metrics

GET    /market/templates        Browse marketplace
GET    /market/templates/:id    Template detail
POST   /market/templates/:id/install  Install template to workspace
POST   /market/templates        Publish new template (creator)
```

### 11.2 GraphQL API (NestJS)

For complex data fetching (dashboard queries that need multiple related entities in one request):

```graphql
type Query {
  workspace(id: ID!): Workspace
  flows(filter: FlowFilter, pagination: Pagination): FlowConnection
  flow(id: ID!): Flow
  events(filter: EventFilter, pagination: Pagination): EventConnection
  analytics(period: AnalyticsPeriod!): WorkspaceAnalytics
  marketTemplates(category: String, search: String): [MarketTemplate]
}

type Mutation {
  createFlow(input: CreateFlowInput!): Flow
  updateFlow(id: ID!, input: UpdateFlowInput!): Flow
  triggerFlow(id: ID!, payload: JSON): FlowRun
  installTemplate(templateId: ID!): Flow
}

type Subscription {
  flowRunUpdated(flowId: ID!): FlowRun
  newEvent(connectors: [String]): PulseEvent
  systemAlert: Alert
}
```

### 11.3 Public API (for developers building on PulseGrid)

Rate limited by plan. Allows external systems to:
- Send custom events into PulseGrid (`POST /api/v1/ingest`)
- Trigger flows programmatically
- Read workspace data
- Register dynamic webhooks

API keys managed in the dashboard. Usage tracked in ClickHouse and billed per million events.

---

## 12. Security Architecture

### 12.1 Authentication & Authorization

- **Authentication:** Custom-built enterprise IAM framework spanning NestJS and Spring Boot. Employs JWT access tokens (15min expiry) + refresh tokens (30 days, stored in httpOnly cookies).
- **OAuth2:** Native social login bridging integration via custom IAM for Google, GitHub, Microsoft.
- **SSO (Enterprise):** Deep custom implementation of SAML 2.0 / OIDC specifically built into our Spring Boot enterprise layers without generic off-the-shelf third-party Identity Providers. Handles isolated tenant scaling.
- **LDAP (Enterprise):** Active Directory synchronization for direct user provisioning.
- **MFA:** TOTP (Google Authenticator compatible) + WebAuthn/Passkey support natively handled by custom IAM.
- **Authorization:** Granular Role-Based Access Control (RBAC) mapping to specific workspace configurations — owner, admin, member, viewer, API-only. Mandatory SOC2 and HIPAA compliant audit logging on all access alterations.

### 12.2 Encryption

| Data | Method |
|---|---|
| Passwords | Argon2id (time=2, mem=65536, parallelism=2) |
| Credentials | AES-256-GCM, zero-knowledge |
| Data in transit | TLS 1.3 (enforced, no downgrade) |
| Database at rest | AES-256 (PostgreSQL transparent encryption) |
| Backup files | AES-256-GCM with separate backup key |
| API keys | BLAKE3 hash stored, full key shown only once |

### 12.3 Secrets Management

- Infrastructure secrets managed via Kubernetes Secrets (encrypted at rest via KMS)
- Application secrets injected as environment variables (never in code/config files)
- Secrets rotation automated via External Secrets Operator + AWS Secrets Manager (paid phase)
- PulseCore vault keys stored in HSM for enterprise tier

### 12.4 Security Practices

- **Input validation:** All API inputs validated via `class-validator` (NestJS) and Rust's type system
- **SQL injection:** Prevented by `sqlx` prepared statements (no raw string interpolation)
- **SSRF protection:** Connector HTTP calls restricted to allowlisted domains, no private IP ranges
- **WASM sandbox:** User code runs in isolated wasmtime instance with no filesystem/network access
- **Rate limiting:** Per-user and per-IP rate limits on all endpoints (NestJS throttler)
- **CORS:** Strict allowlist of trusted origins
- **CSP:** Content Security Policy headers on all web apps
- **Audit logging:** Every privileged action logged to immutable append-only audit table (enterprise)
- **Penetration testing:** Quarterly automated + annual manual pentest (paid phase)

### 12.5 Custom IAM Compliance Readiness

The proprietary IAM system and background-escrow architecture are natively designed to pass strict requirements:

| Standard | Implementation Status |
|---|---|
| GDPR / CCPA | Complete data minimization. Secure user consent tracking. Right to erasure fully triggers cascading token and master-escrow key purges. |
| SOC 2 Type II | Granular access control configurations. Complete IAM audit logging to ClickHouse on all configuration modifications and delegated authentications. |
| HIPAA | Supports PHI-compliant access patterns. Ensures rigid session timeouts, rigorous role-based access configurations, and end-to-end encryption tracking. |
| ISO 27001 | Foundational controls implemented via HSM key-wrapping and continuous risk-based telemetry. |

---

## 13. Infrastructure & DevOps

### 13.1 Free-Tier Infrastructure (Phase 1 — $0/month)

| Service | Provider | Free Tier Limit |
|---|---|---|
| PulseCore (Rust) | Fly.io | 3 shared-CPU VMs, 256MB RAM each |
| NestJS API | Railway | $5 credit/month (covers small traffic) |
| Next.js Dashboard | Vercel | 100GB bandwidth, hobby plan |
| PostgreSQL | Supabase | 500MB, 2 CPUs |
| Redis | Upstash | 10,000 req/day |
| ClickHouse | ClickHouse Cloud | 1M rows/month free |
| File storage (logs/backups) | Cloudflare R2 | 10GB free |
| CDN / DDoS | Cloudflare | Free plan |
| Email (transactional) | Resend | 3,000 emails/month |
| CI/CD | GitHub Actions | 2,000 min/month |
| Monitoring | Better Uptime | 50 monitors free |

**Estimated monthly cost at Phase 1: $0–$20**

### 13.2 Paid Infrastructure (Phase 3+ — scales with revenue)

| Service | Provider | Est. Cost at 1K paying users |
|---|---|---|
| Kubernetes (EKS) | AWS | ~$150/month (3-node cluster) |
| PostgreSQL | AWS RDS | ~$50/month (db.t3.medium) |
| Redis | AWS ElastiCache | ~$40/month |
| ClickHouse | ClickHouse Cloud | ~$30/month |
| Object storage | AWS S3 | ~$10/month |
| CDN | Cloudflare Pro | $20/month |
| Email | AWS SES | ~$5/month |
| Monitoring | Datadog | ~$30/month |
| SSL / Secrets | AWS ACM / Secrets Manager | ~$10/month |

**Estimated monthly infra cost at 1K paying users: ~$350**  
**Revenue at 1K users ($12/mo avg): $12,000/month**  
**Gross margin: ~97%**

### 13.3 Kubernetes Architecture

```yaml
# Helm chart structure
pulsegrid/
├── charts/
│   ├── pulsecore/         # Rust engine — HPA 2–20 replicas
│   ├── api-gateway/       # NestJS — HPA 2–10 replicas
│   ├── enterprise/        # Spring Boot — 1–4 replicas
│   ├── dashboard/         # Next.js — 2–4 replicas
│   ├── admin/             # Angular — 1–2 replicas
│   ├── postgres/          # StatefulSet + PVC
│   ├── redis/             # StatefulSet (or external)
│   └── clickhouse/        # StatefulSet (or external)
├── values.yaml            # Default values
├── values.prod.yaml       # Production overrides
└── values.staging.yaml    # Staging overrides
```

**Horizontal Pod Autoscaling (HPA) — PulseCore:**
```yaml
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
  - type: Pods
    pods:
      metric:
        name: events_per_second
      target:
        type: AverageValue
        averageValue: 10000
```

### 13.4 CI/CD Pipeline (GitHub Actions)

```
Push to feature branch
    │
    ├── Lint (clippy for Rust, ESLint for TS)
    ├── Unit tests (cargo test, Jest)
    ├── Integration tests (testcontainers)
    └── Build Docker image (cache layers)

Pull Request to main
    │
    ├── All above +
    ├── Security scan (cargo audit, npm audit, Trivy)
    ├── Contract tests (API schema compatibility)
    └── Preview deployment (Vercel/Fly preview)

Merge to main
    │
    ├── Build + tag Docker images
    ├── Push to GitHub Container Registry
    ├── Deploy to staging (Helm upgrade)
    ├── Smoke tests on staging
    └── Deploy to production (blue-green via Argo CD)
```

### 13.5 Monitoring & Observability

- **Metrics:** Prometheus (Rust exposes via `prometheus` crate, NestJS via `@willsoto/nestjs-prometheus`)
- **Dashboards:** Grafana (flow run rates, API latency, error rates, queue depths)
- **Distributed tracing:** OpenTelemetry → Jaeger (trace a single event through all services)
- **Log aggregation:** Loki (structured logs from all services, queried in Grafana)
- **Uptime monitoring:** Better Uptime (public status page at status.pulsegrid.io)
- **Error tracking:** Sentry (Next.js, NestJS, Flutter apps)
- **Alerting:** PagerDuty for P0/P1 incidents (post Phase 2)

---

## 14. Revenue Model

### 14.1 Subscription Plans

| Feature | Free | Pro ($12/mo) | Business ($49/mo/workspace) | Enterprise (Custom) |
|---|---|---|---|---|
| Flows | 5 | Unlimited | Unlimited | Unlimited |
| Events per day | 1,000 | 100,000 | 2,000,000 | Custom SLA |
| Run history | 7 days | 90 days | 1 year | Custom |
| Connectors | Tier 1 only | Tier 1 + 2 | All tiers | All + custom |
| AI suggestions | — | Basic | Full | Full + dedicated |
| Team members | 1 | 3 | 25 | Unlimited |
| API access | — | Yes (rate limited) | Yes (higher limits) | Dedicated |
| Custom code steps | — | Yes | Yes | Yes |
| SSO / LDAP | — | — | — | Yes |
| Audit logs | — | 30 days | 1 year | Immutable |
| SLA | — | — | 99.9% | 99.99% |
| White-label | — | — | — | Yes |
| On-premise | — | — | — | Yes |
| Support | Community | Email | Priority email | Dedicated CSM |
| Price | $0 | $12/mo | $49/mo/workspace | Contact sales |

### 14.2 Additional Revenue Streams

**API Usage Billing:**
After exceeding plan's event limit:
- $0.50 per 100,000 additional events
- $0.10 per 1,000 additional connector API calls
- Billed monthly, transparent usage dashboard

**AutoMarket Commission:**
- 30% platform fee on all paid template sales
- Free templates do not generate commission but drive user acquisition
- Creator payouts via Stripe Connect (weekly)

**White-Label Licensing:**
- SaaS companies can embed PulseGrid under their own brand
- Annual license: $10,000–$100,000 depending on usage
- Includes API access, custom domain, logo removal, dedicated support

**Connector Premium Partnerships:**
- Enterprise software vendors (SAP, Oracle, Workday) pay partnership fees to be featured connectors
- Certified partner connectors get a "Verified" badge and placement in top results

**Professional Services:**
- Custom connector development: $150/hour
- Enterprise onboarding: $2,000–$10,000 setup fee
- Custom flow development for enterprise clients: project-based pricing

### 14.3 Revenue Projections

| Phase | Timeline | MRR Target | How |
|---|---|---|---|
| Phase 1 MVP | Month 0–6 | $0–$500 | Early adopters, first Pro users |
| Phase 2 Growth | Month 7–18 | $1K–$10K | Product Hunt launch, DevRel, marketplace launch |
| Phase 3 Scale | Month 19–36 | $10K–$50K | B2B sales, enterprise deals, white-label |
| Phase 4 Expand | Month 37–60 | $50K–$200K | Global expansion, partner ecosystem, API economy |

---

## 15. Monetization Strategy

### 15.1 Freemium Conversion Funnel

```
1,000 new signups
    │
    ▼
700 activate (build at least 1 flow)
    │
    ▼
300 become regular users (flow runs weekly)
    │
    ▼
60 hit free tier limits (want more events/connectors)
    │
    ▼
20 convert to Pro ($12/mo) — 2% overall, 33% of engaged users
    │
    ▼
3 upgrade to Business ($49/mo) — when team grows
```

**Conversion levers:**
- **Usage-based nudges:** "You've used 80% of your monthly events. Upgrade for unlimited."
- **Feature discovery:** Gate power features (AI, code steps, advanced analytics) to create desire
- **Social proof:** Showcase template marketplace earnings and success stories
- **Annual discount:** 2 months free on annual plans (pay $120 instead of $144 for Pro)

### 15.2 Marketplace Flywheel

```
More users → More demand for templates
More demand → More creators publish templates
More templates → More value → More users join
Better templates → Higher prices → Creators earn more → More creators join
```

The marketplace becomes self-sustaining once ~50 quality templates are available. Target: 100 templates at launch via creator outreach (give 6-month Pro free to early template creators).

### 15.3 Developer Ecosystem as Marketing

Every developer who builds with the PulseGrid API or embeds the Vue SDK is a distribution channel. If a Shopify app with 10,000 merchants embeds a PulseGrid automation panel, those 10,000 merchants become potential PulseGrid users. Pursue active SDK partnerships from Month 12.

---

## 16. Go-To-Market Strategy

### 16.1 Phase 1 — Community & Developer Traction (Month 1–6)

**Target:** Developers and indie hackers who feel the pain of existing tools

**Channels:**
- Open-source PulseCore (Rust engine) on GitHub — builds developer trust and SEO
- Post build logs on Twitter/X and LinkedIn throughout development ("Building PulseGrid in public")
- Write technical Rust blog posts (Rust + Tokio, async event processing, zero-knowledge encryption)
- Submit to Hacker News "Show HN" at beta launch
- Join Rust communities (Reddit r/rust, Rust Discord, Rustaceans Slack)
- Launch on GitHub Discussions to build early community
- Create a free "Automation Starter Kit" — 20 free templates, no signup required to browse

**Goal:** 500 GitHub stars, 200 waitlist signups, 50 beta testers

### 16.2 Phase 2 — Public Launch (Month 7–12)

**Channels:**
- Product Hunt launch (schedule for Tuesday, coordinate upvotes from beta community)
- Twitter/X viral demo video showing 60-second automation build (target: 100K views)
- Dev.to and Hashnode articles: "I built an automation platform in Rust — here's what I learned"
- YouTube demo videos (automation use cases: developers, small businesses)
- AppSumo deal for first 6 months (lifetime deal to generate upfront cash and users)
- Cold outreach to productivity newsletters and podcasts
- Affiliate program: $20/referral for Pro upgrades

**Goal:** 5,000 users, 200 paying customers, $2,400 MRR

### 16.3 Phase 3 — B2B Growth (Month 13–24)

**Channels:**
- LinkedIn content targeting operations managers, IT directors, startup founders
- Cold email to operations and IT decision makers (buy lists + Apollo.io)
- Partner with Shopify app developers (revenue share on user conversions)
- Attend SaaStr, MicroConf, and DevRel conferences
- SEO content: "best Zapier alternative", "automate [X] without code", "Rust automation platform"
- Case studies: document 3 customer success stories with measurable ROI

**Goal:** 1,000 paying customers, 20 enterprise pilots, $15,000 MRR

---

## 17. Development Roadmap

### Phase 1 — Foundation MVP (Month 1–4)

**Objective:** Working product with real users

**Milestone 1.1 — PulseCore Engine (Month 1)**
- Rust workspace setup (`cargo workspace`)
- `core-engine`: Tokio event loop pulling from Redis Streams, WebSocket server (Axum), basic rule evaluation
- `core-connectors`: 10 connectors (Gmail, Slack, GitHub, Telegram, HTTP, Schedule, Webhook, Google Sheets, Notion, Discord)
- `core-vault`: AES-256-GCM credential encryption
- PostgreSQL schema (flows, credentials, users, workspaces)
- Redis connection (session cache, rate limiting)
- gRPC interface (Tonic) — NestJS can call the engine
- Docker container + basic Fly.io deployment

**Milestone 1.2 — API + Auth (Month 2)**
- NestJS API Gateway setup
- JWT authentication (register, login, refresh, logout)
- Google/GitHub OAuth2 login
- Flow CRUD endpoints
- Credential management endpoints (encrypted client-side)
- WebSocket relay (engine events → frontend clients)
- Rate limiting, input validation
- Deploy to Railway

**Milestone 1.3 — Web Dashboard (Month 3)**
- Next.js dashboard with App Router
- AutoFlow canvas (react-flow based drag-and-drop builder)
- Flow list, create, edit, enable/disable, delete
- Live event feed (WebSocket connected)
- Connector installation flow (OAuth2, API key)
- Basic analytics overview
- Deploy to Vercel

**Milestone 1.4 — Beta Polish + Deployment (Month 4)**
- 10 → 30 connectors
- Flow run history and logs
- Email notifications on flow failures
- Rust CLI (`pulse` command) — basic flow management
- Public beta launch (invite-only, 100 users)
- Feedback collection, bug fixing

**Phase 1 deliverables:**
- PulseCore Rust engine running on Fly.io
- NestJS API on Railway
- Next.js dashboard on Vercel
- 30+ connectors
- 100 beta users

---

### Phase 2 — Growth Product (Month 5–10)

**Milestone 2.1 — Mobile App (Month 5–6)**
- Flutter app: flow management, event feed, push notifications, daily digest, quick triggers, approval flows, share extension
- Home screen widgets (Flutter)
- Biometric auth
- BLE device pairing (smart home)
- Deploy to App Store + Google Play

**Milestone 2.2 — PulseAI (Month 6–7)**
- Pattern detection model (Rust + ONNX/tract)
- Natural language flow builder (LLM API integration)
- Run failure analysis and suggestions
- Weekly usage digest (push notification)
- Anomaly detection alerts

**Milestone 2.3 — AutoMarket Marketplace (Month 7–8)**
- Template publishing flow (creator tools)
- Template browsing and one-click install
- Stripe Connect for creator payouts
- Review and ratings system
- Launch with 50 free templates (created in-house + early creator program)

**Milestone 2.4 — Public Launch + Pro Plan (Month 9–10)**
- Product Hunt launch
- Pro plan ($12/mo) + Stripe billing
- Usage metering and upgrade prompts
- 100+ connectors
- API access for Pro users
- Full documentation site

**Phase 2 deliverables:**
- iOS + Android apps live
- PulseAI suggestions live
- Marketplace with 100+ templates
- Pro billing live
- 2,000+ users, 150+ paying customers

---

### Phase 2 Quick Wins — Before Phase 2 Core Launch (Month 8–9)

These are low-effort, high-impact features that build immediate developer love and competitive advantage. Each can be built in 1–2 days and deployed independently:

#### 2.A — Event Replay Ring Buffer
**What:** Store last 500 webhook/event payloads per flow in Redis. When a user updates their flow, they click "Replay" on any past event and see exactly what the new flow would do with real historical data — without waiting for the event to happen again.

**Why:** Debugging superhero moment. Debugging is the #1 pain point across all automation platforms. Zero competitors have this.

**Implementation:** 
- Redis sorted set: `flow:{id}:events` with 24h TTL
- Add to event dispatcher in PulseCore
- Replay endpoint in API Gateway that re-queues event with the current flow definition
- Frontend: "Replay" button on past events in execution history

**Effort:** 1 day  
**Moat:** Developer retention — converts developers immediately

#### 2.B — Webhook Deduplication via Idempotency Key
**What:** Accept idempotency keys in webhook payloads (configurable JSONPath, e.g., `$.id` or `$.event.uuid`). Store seen keys in Redis with 24h TTL. If the same key hits twice, silently drop the duplicate. Prevents duplicate orders, duplicate Slack messages, duplicate Jira tickets.

**Why:** Every webhook service (Stripe, GitHub, Shopify) retries on failure. Users have complained about duplicate runs forever. No competitor handles this automatically.

**Implementation:**
- Webhook controller in API Gateway: extract idempotency key from request
- Redis SET: `idempotency:{workspace}:{key}` with 24h TTL
- Return 200 immediately if key exists (idempotent response)
- Add UI field in webhook trigger config: "Idempotency Key Path" with JSONPath picker

**Effort:** 3 hours  
**Moat:** Reliability — prevents the #1 production embarrassment (duplicate runs)

#### 2.C — Dependency Impact Analysis
**What:** Query UI: "Which flows use this credential?" / "If I rotate this API key, what breaks?" Show a dependency graph: credentials → connectors → flows. Pre-calculate and cache this graph (rebuild on flow save).

**Why:** Table stakes for teams with 20+ flows. Implemented as a JSONB query on `flows.definition` — almost free to build. Zero competitors have it.

**Implementation:**
- New endpoint: `GET /credentials/{id}/dependents` 
- Query: `SELECT id, name FROM flows WHERE definition @> jsonb_build_object('action', jsonb_build_object('connector', 'slack'))` (pattern for each connector type)
- Cache in Redis with 1h TTL, invalidate on flow save
- Add "Impact Preview" modal when rotating a credential

**Effort:** 4 hours  
**Moat:** Growth — enterprise teams will specifically ask for this

---

### Phase 3 — Enterprise & Scale (Month 11–18)

**Milestone 3.1 — Enterprise Services (Month 11–13)**
- Spring Boot enterprise service (billing engine, SSO, audit logs)
- Angular enterprise admin panel
- SAML 2.0 / OIDC SSO integration
- LDAP/Active Directory sync
- Multi-tenant workspace isolation (schema-per-tenant for enterprise)
- Compliance: GDPR data export, SOC2 evidence collection
- Business plan ($49/mo) launch

**Milestone 3.2 — Advanced Automation (Month 13–15)**
- Custom code steps (WASM sandbox in wasmtime)
- Human-in-the-loop approval steps
- Advanced branching (parallel splits, merge points)
- Loop steps (iterate over arrays)
- Sub-flows (reusable automation components)
- Flow versioning and rollback
- Staging environments (test flows before deploying to production)

**Milestone 3.3 — Vue Embeddable SDK (Month 15–16)**
- Vue SDK: `<pulse-trigger>`, `<pulse-status>`, `<pulse-panel>` web components
- NPM package (`@pulsegrid/sdk`)
- CDN distribution
- Shopify app (first SDK integration)
- SDK partner program launch

**Milestone 3.4 — Kubernetes + Observability (Month 16–18)**
- Migrate to Kubernetes (AWS EKS)
- Helm charts for all services
- Prometheus + Grafana monitoring
- Distributed tracing (OpenTelemetry + Jaeger)
- Log aggregation (Loki)
- Horizontal pod autoscaling
- Blue-green deployments
- 99.9% uptime SLA enforcement

**Phase 3 Core Developer & Reliability Features**

#### 3.A — Live Execution Debugger with Per-Step I/O Viewer
**What:** Show every step's exact input and output in real-time as the flow runs. Expandable JSON, diff highlighting when data changes between steps, and a replay button to rerun any single step with frozen inputs from a past run.

**Why:** The #1 complaint across every automation platform — "I can't see what's happening inside my flow." This is n8n's main developer advantage. PulseGrid should destroy it.

**Implementation:**
- Stream step outputs via WebSocket to dashboard during execution
- Store step I/O in Redis: `flow_run:{id}:step_outputs` (TTL: 24h)
- Step replay endpoint: re-execute a single step with frozen input
- Dashboard: Execution view with step-by-step timeline, JSON viewer with diff highlighting

**Effort:** 2 weeks  
**Moat:** Developer moat — converts developers immediately

#### 3.B — Flow Versioning with Visual Diff
**What:** Every save creates a snapshot. Users can browse version history, see a visual diff between two versions (nodes added/removed highlighted in green/red), and one-click roll back. Store the full definition JSONB in a `flow_versions` table.

**Why:** Zapier has this behind a paywall. n8n doesn't have it in cloud. It's the bridge to marketplace templates: "this template was updated, here's what changed."

**Implementation:**
- New table: `flow_versions(id, flow_id, definition, created_at, created_by, note)`
- Create version on every flow save (in transaction)
- Diff algorithm: compare JSONB, highlight added/removed nodes and step changes
- Rollback endpoint: revert to previous version
- Dashboard: Version history sidebar with visual diff

**Effort:** 2 weeks  
**Moat:** Growth — power users will trust versioning for production changes

#### 3.C — Human-in-the-Loop Approval Steps
**What:** A new `wait_for_approval` step type that pauses flow execution and sends an approval request (Slack message with buttons, email with links, or mobile push). The flow resumes only when approved, or aborts on rejection. Multi-approver support with routing rules ("amount > $10k requires CFO").

**Why:** Zapier charges extra for "Interfaces." n8n doesn't have it. Make doesn't have it. This unlocks finance, HR, and ops automation use cases that currently can't use any of these tools.

**Implementation:**
- New step type in executor: `wait_for_approval`
- Flow state: pause execution, store pending approval record
- Approval request template: render in Slack/email/push
- Approval token endpoint: resume execution on approve/reject
- Routing rules: conditional approver selection via JavaScript expression

**Effort:** 2 weeks  
**Moat:** Growth — unlocks enterprise and SMB automations that competitors can't do

#### 3.D — Connector Circuit Breaker + Health Monitoring
**What:** Automatically detect when a connector API starts failing (error rate > threshold over a time window). Open the circuit: pause all flows using that connector, alert the workspace, show which flows are affected. Resume when the connector recovers. Live dashboard: uptime, p95 latency, error rate per connector.

**Why:** Kills the "silent failure" problem every Zapier user complains about. No automation platform does this.

**Implementation:**
- Error rate tracker: Redis counter per connector (5min window)
- Circuit breaker: if error_rate > 50% for 5min, mark connector unhealthy
- Flow pause: query for flows using unhealthy connector, mark as paused
- Alert dispatcher: Slack/email alert to workspace admins
- Health dashboard: per-connector uptime %, p95 latency from ClickHouse

**Effort:** 1.5 weeks  
**Moat:** Reliability — enterprises will specifically ask for this

**Phase 3 deliverables:**
- Enterprise-ready (SSO, audit, compliance)
- Live debugger with per-step I/O viewer live
- Flow versioning + visual diff live
- Human-in-the-loop approval steps live
- Connector circuit breaker + health dashboard live
- Vue SDK live with Shopify integration
- Kubernetes infrastructure
- Business + Enterprise plans live
- 500+ connectors
- 20+ enterprise pilots

**Phase 4 Enterprise & Advanced Operations Features**

#### 4.A — Saga Pattern & Compensation Rollback
**What:** For flows with multiple steps across different systems, implement automatic compensation. If step 3 fails, automatically execute predefined compensation steps to undo step 1 and step 2. Example: "Create invoice → Create payment → Create fulfillment" fails → automatically cancel payment, delete invoice.

**Why:** Enterprises running mission-critical automations need data consistency guarantees. This is what expensive enterprise platforms charge $100k/year for.

**Implementation:**
- Schema: Add `compensation_steps` array to flow definition (list of steps to run on failure)
- Executor: Track successful steps, on failure execute compensation in reverse order
- Compensation steps: support conditionals ("only compensate if original step succeeded")
- Dashboard: Visual builder for compensation chains
- Webhooks: Send compensation event to external systems on trigger

**Effort:** 3 weeks  
**Moat:** Enterprise — Stops financial/data integrity chaos

#### 4.B — SLA Enforcement with Latency Budgets
**What:** Define SLA per flow: "must complete in <5min or alert." PulseGrid enforces this: if a step runs past its latency budget, abort and execute fallback. Dashboard shows actual vs. budgeted time per step, SLA breach rate per flow, and historical trends.

**Why:** Enterprises have SLAs to their customers. This makes flows trustworthy for customer-facing automations.

**Implementation:**
- Schema: Add `sla_max_duration_ms`, `fallback_steps` to flow definition
- Executor: Track elapsed time per step, abort if exceeds budget
- Metrics: Store latency per step in ClickHouse
- Dashboard: SLA tracking, breach rate, trend analysis, alerts for repeated breaches
- Integrations: PagerDuty/Opsgenie alert on SLA breach

**Effort:** 2 weeks  
**Moat:** Reliability/Enterprise — Only platform with enforceable SLAs

#### 4.C — Per-Step Latency Analytics & Cost Attribution
**What:** Drill-down view: "Show me the latency breakdown for all runs of Flow X." See p50, p95, p99 latency per step, identify bottlenecks, and see which step consumes the most compute resources. Cost attribution: show which steps are expensive (external API calls, compute-heavy transformations).

**Why:** Enterprise customers need cost accountability and performance optimization tools.

**Implementation:**
- Metrics: Store step duration + resource usage in ClickHouse (per step, per flow)
- API: Endpoint for percentile latency, cost breakdown per step
- Dashboard: "Flamegraph" view of per-step latency, drill-down to individual runs
- Cost calculator: multiply step count × cost_per_api_call for budget forecasting
- Alerts: alert if p95 latency > SLA threshold or cost > budget

**Effort:** 1.5 weeks  
**Moat:** Observability — Competitors don't have this

#### 4.D — OpenTelemetry Export & Native Observability
**What:** PulseGrid becomes a native citizen in the enterprise observability ecosystem. Export traces to any vendor (Datadog, New Relic, Honeycomb, Jaeger): every flow run is a trace, every step is a span. Includes custom attributes (workspace_id, connector_type, error_code).

**Why:** Enterprises already have observability infrastructure. This integration makes PulseGrid invisible in their existing tools.

**Implementation:**
- OpenTelemetry SDK: Instrument executor with `tracing_opentelemetry` crate
- Exporter configuration: Jaeger OTLP or Datadog agent endpoint
- Attributes: workspace_id, flow_id, step_id, connector_type, duration, error_code
- Sampling: Configurable sampling rate for high-volume flows
- Dashboard: Link to external traces (if Datadog/Honeycomb installed)

**Effort:** 1 week  
**Moat:** Enterprise/Observability — Seamless vendor integration

#### 4.E — Zero-Downtime Updates & Canary Deployments
**What:** Deploy new PulseGrid versions without stopping active flows. In-flight flow runs continue with the old engine, new runs use the new version. Canary deployment: roll out to 10% of traffic first, monitor errors, roll back automatically if error rate spikes.

**Why:** Enterprise production requirements: "we can't have downtime."

**Implementation:**
- Versioned executor: Deploy new executor as new pod, old pods drain gracefully
- Kubernetes StatefulSet: Rolling update with grace period
- Canary traffic split: 10% of new flows to new version, monitor error rate
- Auto-rollback: If error rate > baseline + 10%, rollback deployment
- Metrics: Error rate, latency, throughput per version

**Effort:** 2 weeks  
**Moat:** Enterprise/Reliability — Only platform with true zero-downtime updates

**Phase 4 deliverables:**
- Saga pattern with automatic rollback live
- SLA enforcement + latency budgets live
- Per-step latency analytics + cost tracking live
- OpenTelemetry export live
- Zero-downtime canary deployments live
- 1000+ connectors
- 500+ customers
- Enterprise NPS > 60

---

### Phase 4 — Ecosystem & Expansion (Month 19–36)

- Edge deployment: Rust engine instances in multiple regions (Fly.io global)
- On-premise enterprise offering (Helm chart for self-hosted K8s)
- Partner API program (third-party connector marketplace)
- Advanced ML: predictive automation, business intelligence layer
- Native database connectors (direct PostgreSQL, MySQL, MongoDB, BigQuery)
- PulseGrid for IoT: dedicated hardware gateway device (Raspberry Pi image)
- Global expansion: i18n for 10 languages
- ISO 27001 certification
- Series A fundraise or strategic acquisition discussions

---

## 18. Team Structure (Solo to Scale)

### Month 1–6 — Solo Founder (You)

Build everything. This is feasible because:
- All services are your existing skills
- Free hosting costs nothing
- Rust CLI and automation mean less manual ops work
- Focus on one surface at a time (Core → API → Web → Mobile)

**Recommended build order for solo:**
1. PulseCore Rust engine (your moat)
2. NestJS API Gateway
3. Next.js dashboard (MVP)
4. Flutter mobile app
5. Everything else

### Month 7–18 — First Hires (Revenue-funded)

| Role | When | Why |
|---|---|---|
| Full-stack developer | $2K MRR | Share frontend load (Angular, Vue SDK) |
| DevOps / SRE | $5K MRR | Kubernetes, monitoring, on-call |
| Developer Advocate | $8K MRR | Content, community, SDK partnerships |

### Month 19–36 — Small Team

| Role | When |
|---|---|
| Enterprise sales | $15K MRR |
| Customer success | $20K MRR |
| Backend engineers (2) | $30K MRR |
| ML engineer | $40K MRR |

---

## 19. Competitive Analysis

### 19.1 Direct Competitors

**Zapier:**
- Revenue: ~$140M ARR (2024)
- Weakness: Polling-based (slow), expensive at scale, no mobile app, no IoT, no marketplace
- PulseGrid advantage: Real-time, 5× cheaper, mobile-first, AI-powered, marketplace

**Make (formerly Integromat):**
- Revenue: ~$50M ARR
- Weakness: Complex UI, no mobile app, no IoT, PHP-based (slow), no CLI
- PulseGrid advantage: Better UX, mobile app, IoT, developer CLI, faster engine

**n8n:**
- Revenue: ~$20M ARR
- Weakness: Self-hosted first, no marketplace, no mobile app, complex setup
- PulseGrid advantage: Cloud-first, marketplace, mobile app, AI, easier onboarding

**Microsoft Power Automate:**
- Revenue: Part of Microsoft 365 (billions)
- Weakness: Microsoft-ecosystem lock-in, expensive, enterprise-only UX
- PulseGrid advantage: Open ecosystem, consumer-friendly, independent

### 19.2 Indirect Competitors

- **Notion automations** — limited to Notion ecosystem
- **Shopify Flow** — limited to Shopify
- **GitHub Actions** — limited to code/CI
- **Home Assistant** — limited to smart home, no business integrations

### 19.3 PulseGrid's Defensible Moats

1. **Rust engine performance** — 10× cheaper to run at scale → pricing advantage
2. **Marketplace network effects** — templates attract users, users attract creators
3. **Zero-knowledge encryption** — trust moat, expensive for competitors to match retroactively
4. **IoT + mobile-first** — no competitor has native mobile + IoT + business automation in one
5. **Developer ecosystem (CLI + SDK)** — distribution moat via embedded partners

---

## 20. Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Zapier copies real-time triggers | High | Medium | Rust cost moat; they can't cheaply rebuild at scale |
| Connector APIs change / revoke access | Medium | High | Abstract connector interface; fast update cycle |
| Low conversion from free to paid | Medium | High | Usage-based nudges; generous free tier to grow network |
| Security breach (credential leak) | Low | Critical | Zero-knowledge design; no plaintext credentials stored |
| Rust developer hiring difficulty | Medium | Medium | Solo first; open-source engine attracts contributors |
| AWS/Fly.io outage | Low | High | Multi-region; auto-failover; status page |
| AppStore rejection (mobile app) | Low | Medium | Follow Apple/Google guidelines strictly; no policy violations |
| Template marketplace abuse | Medium | Medium | Review process; WASM sandbox; buyer protection |
| GDPR compliance issue | Low | High | Data processing agreements; right to erasure built in |

---

## 21. Success Metrics & KPIs

### Product Metrics

| Metric | Target (Month 6) | Target (Month 18) | Target (Month 36) |
|---|---|---|---|
| Monthly Active Users (MAU) | 500 | 5,000 | 50,000 |
| Daily Active Users (DAU) | 100 | 1,000 | 15,000 |
| Paying customers | 25 | 500 | 5,000 |
| Monthly Recurring Revenue | $300 | $8,000 | $75,000 |
| Flow runs per day | 10,000 | 1,000,000 | 50,000,000 |
| Connectors available | 30 | 200 | 500+ |
| Marketplace templates | 0 | 200 | 2,000 |
| Net Promoter Score (NPS) | — | 40 | 55 |

### Technical Metrics

| Metric | Target |
|---|---|
| Event processing latency (p99) | < 50ms |
| API response time (p95) | < 200ms |
| Platform uptime | > 99.9% |
| Flow run success rate | > 99% |
| Mobile app crash-free rate | > 99.5% |

### Business Metrics

| Metric | Target |
|---|---|
| Free → Pro conversion rate | > 3% |
| Pro → Business upgrade rate | > 8% |
| Monthly churn rate | < 3% |
| Customer Acquisition Cost (CAC) | < $30 |
| Lifetime Value (LTV) at Pro | > $200 |
| LTV:CAC ratio | > 6:1 |

---

## 22. Future Vision

PulseGrid's 5-year vision extends beyond a SaaS product into **critical digital infrastructure**:

### PulseGrid OS
Transform from a web app into a true operating system layer that runs natively on:
- Personal computers (macOS/Windows/Linux daemon)
- Smart home hubs (dedicated hardware — PulseBox)
- Enterprise servers (on-premise Kubernetes distribution)

### PulseGrid Intelligence
Move from reactive automation to **predictive intelligence**:
- Proactively take actions before problems occur (predict a server will crash → scale up now)
- Optimize business operations automatically (detect inventory shortage trend → reorder before stockout)
- Become a personal chief of staff (manage calendar, emails, finances, health goals autonomously)

### PulseGrid Ecosystem
Evolve from a product into a platform:
- Third-party connector marketplace (like Salesforce AppExchange for automations)
- Automation consultancy network (certified PulseGrid experts)
- Education platform (PulseGrid University — automation certifications)
- Acquisition target for enterprise software companies (Salesforce, ServiceNow, Microsoft)

---

## Appendix: Repository Structure

```
pulsegrid/
├── core/                          # Rust workspace
│   ├── core-engine/               # Main event processing binary
│   ├── core-vm/                   # Flow rule evaluation
│   ├── core-connectors/           # Connector runtime
│   ├── core-vault/                # Encryption module
│   ├── core-ai/                   # ONNX inference
│   ├── core-cli/                  # pulse CLI tool
│   └── core-proto/                # Shared .proto definitions
│
├── api-gateway/                   # NestJS API Gateway
│   ├── src/
│   │   ├── auth/                  # JWT, OAuth2, MFA
│   │   ├── flows/                 # Flow CRUD + execution
│   │   ├── connectors/            # Connector management
│   │   ├── events/                # Event streaming
│   │   ├── analytics/             # Analytics queries
│   │   ├── market/                # Marketplace
│   │   └── webhooks/              # Webhook delivery
│   └── test/
│
├── enterprise/                    # Spring Boot enterprise
│   ├── src/main/java/io/pulsegrid/
│   │   ├── billing/               # Stripe billing
│   │   ├── sso/                   # SAML/OIDC/LDAP
│   │   ├── compliance/            # Audit logs, GDPR
│   │   └── reporting/             # JasperReports
│   └── src/test/
│
├── dashboard/                     # Next.js web app
│   ├── app/                       # App Router pages
│   ├── components/                # UI components
│   ├── lib/                       # API clients, hooks
│   └── public/
│
├── admin/                         # Angular enterprise admin
│   ├── src/app/
│   │   ├── workspaces/
│   │   ├── billing/
│   │   ├── audit/
│   │   └── compliance/
│   └── src/environments/
│
├── mobile/                        # Flutter mobile app (single mobile product)
│   ├── lib/
│   │   ├── features/
│   │   ├── data/
│   │   └── core/
│   ├── shorebird.yaml             # Shorebird OTA code push config
│   └── test/
│
├── sdk/                           # Vue embeddable SDK
│   ├── src/
│   │   ├── components/            # Web components
│   │   └── index.ts               # Entry point
│   └── dist/
│
├── infra/                         # Kubernetes + Terraform
│   ├── helm/
│   │   ├── pulsecore/
│   │   ├── api-gateway/
│   │   ├── enterprise/
│   │   └── dashboard/
│   ├── terraform/                 # AWS infrastructure as code
│   └── scripts/                   # Deployment scripts
│
├── docs/                          # Documentation site
│   ├── guides/
│   ├── api-reference/
│   └── connector-sdk/
│
└── .github/
    ├── workflows/                 # CI/CD pipelines
    └── CONTRIBUTING.md
```

---

## 23. Phase 1 Connector Capability Matrix (Live)

To keep dashboard and API behavior aligned, Phase 1 uses a **live connector catalog contract** exposed by the gateway.

### 23.1 Catalog API Contract

- **Endpoint:** `GET /connectors/catalog`
- **Auth:** JWT required
- **Response shape:**

```json
{
  "count": 30,
  "generatedAt": "2026-04-25T00:00:00.000Z",
  "items": [
    {
      "connector": "github",
      "action": "create_issue",
      "category": "developer",
      "auth": "oauth2",
      "required_input_fields": ["access_token", "owner", "repo", "title"],
      "optional_input_fields": ["body"]
    }
  ]
}
```

### 23.2 Phase 1 Matrix (Current Build)

| Connector | Action | Category | Auth |
|---|---|---|---|
| `http` | `request` | custom | mixed |
| `slack` | `send_message` | communication | none |
| `gmail` | `send_email` | communication | oauth2 |
| `github` | `create_issue` | developer | oauth2 |
| `telegram` | `send_message` | communication | api_key |
| `google_sheets` | `append_rows` | productivity | oauth2 |
| `notion` | `create_page` | productivity | oauth2 |
| `discord` | `send_message` | communication | none |
| `schedule` | `next_run` | core | none |
| `webhook` | `verify_signature` | core | api_key |
| `custom` / `custom_app` | `call_api` | custom | mixed |
| `resend` | `send_email` | communication | bearer |
| `openai` | `chat_completion` | ai | bearer |
| `anthropic` | `messages` | ai | api_key |
| `airtable` | `create_record` | business | bearer |
| `hubspot` | `create_contact` | business | bearer |
| `jira` | `create_issue` | developer | bearer |
| `linear` | `graphql` | developer | bearer |
| `asana` | `create_task` | business | bearer |
| `clickup` | `create_task` | business | api_key |
| `trello` | `create_card` | productivity | api_key |
| `zendesk` | `create_ticket` | business | bearer |
| `pagerduty` | `enqueue_event` | developer | api_key |
| `stripe` | `request` | finance | api_key |
| `sendgrid` | `send_email` | communication | api_key |
| `salesforce` | `create_record` | business | bearer |
| `shopify` | `request` | commerce | api_key |
| `gitlab` | `create_issue` | developer | bearer |
| `monday` | `graphql` | productivity | api_key |
| `brevo` | `send_email` | communication | api_key |

### 23.3 Dashboard Consumption Rule

The dashboard must render connector choices from `/connectors/catalog` dynamically instead of hard-coded lists.

---

*PulseGrid Blueprint v1.0 — Built with Rust at the core, designed to last.*
\n## Advanced Workflow Canvas Features
- Drag edge to update depends_on (connect step output to another step input visually)
- Multiple dependencies (true DAG) allowed rather than linear connections
- Node edit panel that allows editing action configurations instead of just deletion
- Visual parallel branching with auto-layouting (using Dagre) mapping out multiple child nodes
- Loop condition configuration (add custom conditionals directly to loop nodes via edit panel)

---

## 24. PulseGuard — AI Error Intelligence & Autonomous Maintenance Agent

> **What it is:** An always-on AI agent embedded inside PulseGrid that autonomously detects production-level bugs and errors across every layer of the stack, cross-references them against the codebase and the internet, triggers a scoped maintenance mode, and delivers industry-grade patch proposals to a developer review queue — before a human notices anything is wrong.

PulseGuard is not a monitoring tool. It is an autonomous first-responder: it does the 80% of detective work that would otherwise cost a developer two hours at 3 AM, distills it into a ready-to-review patch proposal, and waits for human approval before touching anything in production.

---

### 24.1 Design Philosophy

**Human-in-the-loop is non-negotiable.** PulseGuard detects, diagnoses, and proposes — it never auto-applies code to production. The entire value proposition is that it compresses hours of triage into seconds of review. A developer opens a GuardAlert card, reads the AI's diagnosis plus its web-sourced evidence, and decides: accept, edit, or dismiss. That boundary is what makes PulseGuard trustworthy at enterprise scale.

**Severity drives scope.** Maintenance mode is not binary. PulseGuard maps error severity to the smallest possible blast radius: a connector-level error pauses only the flows using that connector, not the whole platform. A critical memory panic triggers full maintenance mode. This granularity is built on top of PulseCore's existing per-flow enable/disable mechanism — no new infrastructure required.

**Context is everything.** An error message alone is nearly useless for AI diagnosis. PulseGuard enriches every GuardEvent with structured codebase context (pulled from a live index, not raw file dumps), the surrounding 50 log lines, recent deployment history, and connector health state before sending anything to the AI. The quality of the proposal is a direct function of the quality of the context.

---

### 24.2 Architecture Overview

PulseGuard is a standalone `guard/` NestJS microservice that lives alongside the existing `api-gateway/` and `enterprise/` services. It communicates with PulseCore via a dedicated gRPC stream and writes to its own PostgreSQL schema and Redis namespace.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SIGNAL SOURCES                              │
│                                                                     │
│  PulseCore (Rust)   NestJS Gateway    Spring Boot    Next.js        │
│  tracing spans      Bull queue errors  Actuator       Error beacons  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │  GuardEvent stream
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│               LAYER 1 — SIGNAL COLLECTOR                            │
│  Normalizes all signals into GuardEvent struct                      │
│  Publishes to Redis stream: guard:events                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│               LAYER 2 — AI TRIAGE ENGINE (Anthropic API)            │
│  Error + stack trace + codebase index context → claude-sonnet-4    │
│  Classifies severity · identifies root cause · decides scope       │
└────────────────┬──────────────────────────────┬─────────────────────┘
                 │                              │
                 ▼                              ▼
┌──────────────────────────┐     ┌──────────────────────────────────┐
│  LAYER 3A                │     │  LAYER 3B                        │
│  MAINTENANCE ORCHESTRATOR│     │  INTERNET RESEARCH               │
│                          │     │                                  │
│  Sets system:maintenance │     │  Web search via Anthropic        │
│  flag in Redis           │     │  tool use API                    │
│  Pauses affected flows   │     │  CVE databases                   │
│  Notifies via Slack /    │     │  GitHub issues for your deps     │
│  PagerDuty / Telegram    │     │  Framework security advisories   │
└──────────────┬───────────┘     └────────────────┬─────────────────┘
               │                                  │
               └──────────────┬───────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│               LAYER 4 — DEVELOPER REVIEW PANEL (Angular admin)      │
│                                                                     │
│  GuardAlert card:                                                   │
│  · Original error + full stack trace                               │
│  · AI diagnosis with confidence score                              │
│  · Web-sourced CVE / issue context                                 │
│  · Diff-ready code suggestion for affected file(s)                 │
│  · One-click: create GitHub issue + branch via GitHub connector     │
│  · Accept / Edit / Dismiss actions                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │  Developer review
                               ▼
                       Human approval required
                       before any code change
```

---

### 24.3 Core Data Structures

#### GuardEvent (Rust struct — shared via core-proto)

```rust
pub struct GuardEvent {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub source: GuardSource,       // PulseCore | NestJS | SpringBoot | Dashboard
    pub severity: Severity,        // Warning | Error | Critical
    pub category: ErrorCategory,   // Panic | Timeout | ConnectorFailure | AuthFailure | OOM | UnhandledException
    pub message: String,
    pub stack_trace: Option<String>,
    pub surrounding_logs: Vec<LogLine>,  // ±50 lines of context
    pub affected_connector: Option<ConnectorId>,
    pub affected_flow_ids: Vec<Uuid>,
    pub deployment_sha: String,    // git commit at time of error
    pub received_at: DateTime<Utc>,
    pub metadata: serde_json::Value,
}

pub enum Severity {
    Warning,   // Log only, no action
    Error,     // Pause affected flows only
    Critical,  // Full maintenance mode
}

pub enum GuardSource {
    PulseCore,
    NestJSGateway,
    SpringBootEnterprise,
    NextJSDashboard,
}
```

#### GuardAlert (PostgreSQL — guard schema)

```sql
CREATE TABLE guard.alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    guard_event_id  UUID NOT NULL,
    severity        VARCHAR(20) NOT NULL,
    source          VARCHAR(50) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'open',
                    -- open | acknowledged | resolved | dismissed
    ai_diagnosis    TEXT,
    ai_confidence   DECIMAL(4,3),
    web_sources     JSONB,          -- array of URLs + summaries from internet research
    code_suggestion JSONB,          -- { file_path, original, suggested, explanation }
    maintenance_scope JSONB,        -- which flows/connectors were paused
    github_issue_url TEXT,
    resolved_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);

CREATE TABLE guard.codebase_index (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path       TEXT NOT NULL,
    language        VARCHAR(20) NOT NULL,
    function_sigs   JSONB,          -- parsed function signatures via tree-sitter
    error_patterns  TEXT[],         -- known error strings associated with this file
    last_indexed_at TIMESTAMPTZ DEFAULT NOW(),
    git_sha         VARCHAR(40) NOT NULL
);
```

#### Redis Keys (guard namespace)

```
guard:events                          → Redis Stream (GuardEvent source)
guard:consumer:triage                 → Consumer group for AI triage worker
guard:maintenance:{tenant_id}         → Current maintenance state + scope (TTL: 24h)
guard:index:rebuilt_at                → Timestamp of last codebase index rebuild
guard:alert:{id}:status               → Real-time alert status for WebSocket push
```

---

### 24.4 Layer 1 — Signal Collector

The signal collector is a NestJS consumer group worker that subscribes to error events from every service layer and normalizes them into `GuardEvent` structs.

#### PulseCore integration (Rust — new gRPC stream)

Add a `GuardStream` RPC to `core-proto`:

```protobuf
// core-proto/src/guard.proto
syntax = "proto3";

service GuardService {
    rpc StreamGuardEvents(GuardStreamRequest) returns (stream GuardEventProto);
    rpc ReportMaintenanceState(MaintenanceStateRequest) returns (MaintenanceStateResponse);
}

message GuardEventProto {
    string id = 1;
    string tenant_id = 2;
    string severity = 3;
    string category = 4;
    string message = 5;
    string stack_trace = 6;
    repeated string surrounding_logs = 7;
    string deployment_sha = 8;
    int64 received_at_unix_ms = 9;
}
```

In `core-engine`, hook the `tracing` subscriber to emit `GuardEvent` on panic, OOM, and unhandled errors:

```rust
// core-engine/src/guard_emitter.rs
use tracing::subscriber::set_global_default;

pub struct GuardEventLayer {
    guard_tx: mpsc::Sender<GuardEventProto>,
}

impl<S: Subscriber> Layer<S> for GuardEventLayer {
    fn on_event(&self, event: &tracing::Event<'_>, ctx: Context<'_, S>) {
        if *event.metadata().level() <= Level::ERROR {
            let guard_event = GuardEventProto::from_tracing_event(event);
            let _ = self.guard_tx.try_send(guard_event);
        }
    }
}
```

#### NestJS Bull queue errors

```typescript
// guard/src/collectors/nestjs.collector.ts
@Injectable()
export class NestJSSignalCollector implements OnModuleInit {
  constructor(
    @InjectQueue('actions') private actionsQueue: Queue,
    private guardPublisher: GuardEventPublisher,
  ) {}

  onModuleInit() {
    this.actionsQueue.on('failed', async (job, error) => {
      await this.guardPublisher.publish({
        source: GuardSource.NestJSGateway,
        severity: job.attemptsMade >= job.opts.attempts ? Severity.Error : Severity.Warning,
        category: ErrorCategory.UnhandledException,
        message: error.message,
        stackTrace: error.stack,
        affectedFlowIds: [job.data.flowId],
        metadata: { jobId: job.id, jobName: job.name, attemptsMade: job.attemptsMade },
      });
    });
  }
}
```

#### Spring Boot Actuator polling

```typescript
// guard/src/collectors/spring.collector.ts
@Injectable()
export class SpringActuatorCollector {
  @Cron('*/30 * * * * *')  // every 30 seconds
  async pollActuatorHealth() {
    const health = await this.http.get(
      `${process.env.SPRING_INTERNAL_URL}/actuator/health`
    );
    if (health.data.status !== 'UP') {
      await this.guardPublisher.publish({
        source: GuardSource.SpringBootEnterprise,
        severity: Severity.Error,
        category: ErrorCategory.ServiceDown,
        message: `Spring Boot health check failed: ${health.data.status}`,
        metadata: health.data.components,
      });
    }
  }
}
```

#### Next.js browser error beacons

Add a client-side error boundary in `dashboard/app/error.tsx` that POSTs to the guard ingest endpoint:

```typescript
// dashboard/app/error.tsx
'use client';

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    fetch('/api/guard/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'dashboard',
        message: error.message,
        stack: error.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
      }),
    });
  }, [error]);

  return (
    <div>
      <h2>Something went wrong.</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

---

### 24.5 Layer 2 — AI Triage Engine

The triage engine is a Redis Streams consumer that reads from `guard:events`, enriches each event with codebase context, and calls the Anthropic API for diagnosis.

#### Codebase Indexer

A Rust background job (runs in `core-engine` on startup and every 15 minutes) uses `tree-sitter` to parse the codebase and populate `guard.codebase_index`:

```rust
// core-engine/src/guard_indexer.rs
use tree_sitter::{Language, Parser};

pub async fn rebuild_codebase_index(pool: &PgPool) -> Result<()> {
    let git_sha = get_current_git_sha()?;
    let files = walk_source_files(&["core/", "api-gateway/src/", "enterprise/src/"])?;

    for file in files {
        let content = fs::read_to_string(&file.path)?;
        let language = detect_language(&file.path);
        let sigs = extract_function_signatures(&content, language)?;
        let error_patterns = extract_error_strings(&content)?;

        sqlx::query!(
            r#"
            INSERT INTO guard.codebase_index
                (file_path, language, function_sigs, error_patterns, git_sha)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (file_path) DO UPDATE SET
                function_sigs = EXCLUDED.function_sigs,
                error_patterns = EXCLUDED.error_patterns,
                last_indexed_at = NOW(),
                git_sha = EXCLUDED.git_sha
            "#,
            file.path.to_str().unwrap(),
            language.to_string(),
            serde_json::to_value(&sigs)?,
            &error_patterns,
            &git_sha
        )
        .execute(pool)
        .await?;
    }
    Ok(())
}
```

#### Context builder

Before calling the AI, the triage engine fetches the most relevant code context:

```typescript
// guard/src/triage/context-builder.service.ts
@Injectable()
export class ContextBuilderService {
  async buildContext(event: GuardEvent): Promise<TriageContext> {
    // Find files most likely related to this error via error_patterns similarity
    const relevantFiles = await this.db.query<CodebaseIndexRow>(`
      SELECT file_path, function_sigs, language
      FROM guard.codebase_index
      WHERE error_patterns && $1
         OR file_path ILIKE ANY(
              SELECT '%' || unnest($2::text[]) || '%'
            )
      LIMIT 5
    `, [
      [event.message.substring(0, 100)],
      this.extractFileHints(event.stackTrace),
    ]);

    // Fetch recent deployments (last 3)
    const recentDeploys = await this.getRecentDeployments(3);

    // Connector health snapshot
    const connectorHealth = event.affectedConnector
      ? await this.getConnectorHealthSnapshot(event.affectedConnector)
      : null;

    return {
      event,
      relevantFiles,
      recentDeploys,
      connectorHealth,
      surroundingLogs: event.surroundingLogs,
    };
  }
}
```

#### Anthropic API call — triage prompt

```typescript
// guard/src/triage/ai-triage.service.ts
@Injectable()
export class AITriageService {
  async triage(ctx: TriageContext): Promise<TriageResult> {
    const systemPrompt = `
You are PulseGuard, the AI error intelligence agent for PulseGrid — a Rust-powered
automation platform. You receive production error events enriched with codebase context.

Your job:
1. Identify the root cause of the error with high precision.
2. Determine severity scope: Warning (log only) | Error (pause affected flows) | Critical (full maintenance mode).
3. Suggest an industry-grade code fix appropriate for developer review.
4. Output strictly valid JSON — no prose outside the JSON object.

Output format:
{
  "root_cause": "concise root cause description (max 100 chars)",
  "explanation": "full technical explanation of why this error occurs",
  "confidence": 0.0–1.0,
  "severity_recommendation": "Warning|Error|Critical",
  "maintenance_scope": "none|flows_only|full",
  "affected_file_path": "path/to/affected/file.rs or null",
  "code_suggestion": {
    "file_path": "string",
    "original_snippet": "the problematic code",
    "suggested_snippet": "the fixed code",
    "explanation": "why this fix resolves the root cause"
  },
  "search_queries": ["query1 for CVE lookup", "query2 for GitHub issues"]
}`;

    const userMessage = `
## Error Event
Source: ${ctx.event.source}
Severity: ${ctx.event.severity}
Category: ${ctx.event.category}
Message: ${ctx.event.message}

## Stack Trace
\`\`\`
${ctx.event.stackTrace ?? 'Not available'}
\`\`\`

## Surrounding Logs (±50 lines)
\`\`\`
${ctx.event.surroundingLogs.map(l => `[${l.timestamp}] ${l.level} ${l.message}`).join('\n')}
\`\`\`

## Relevant Codebase Context
${ctx.relevantFiles.map(f => `### ${f.filePath}\nFunctions: ${JSON.stringify(f.functionSigs, null, 2)}`).join('\n\n')}

## Recent Deployments
${ctx.recentDeploys.map(d => `- ${d.sha.substring(0, 8)}: ${d.message} (${d.deployedAt})`).join('\n')}

## Connector Health (if applicable)
${ctx.connectorHealth ? JSON.stringify(ctx.connectorHealth, null, 2) : 'N/A'}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    return JSON.parse(raw) as TriageResult;
  }
}
```

---

### 24.6 Layer 3A — Maintenance Mode Orchestrator

The orchestrator maps triage results to the minimum scope of maintenance action required.

```typescript
// guard/src/maintenance/orchestrator.service.ts
@Injectable()
export class MaintenanceOrchestratorService {
  async execute(event: GuardEvent, triage: TriageResult): Promise<MaintenanceResult> {
    switch (triage.maintenanceScope) {
      case 'none':
        // Warning: log the alert, notify dev channel, no service impact
        await this.notifyDeveloper(event, triage, 'low');
        return { scope: 'none', pausedFlows: [] };

      case 'flows_only':
        // Error: pause only the flows affected by this connector/error
        const pausedFlows = await this.pauseAffectedFlows(event.affectedFlowIds);
        await this.redis.set(
          `guard:maintenance:${event.tenantId}:flows`,
          JSON.stringify({ pausedFlows, reason: triage.rootCause, since: new Date() }),
          'EX', 86400
        );
        await this.notifyDeveloper(event, triage, 'medium');
        return { scope: 'flows_only', pausedFlows };

      case 'full':
        // Critical: full maintenance mode
        await this.redis.set(
          `guard:maintenance:${event.tenantId}`,
          JSON.stringify({ reason: triage.rootCause, since: new Date() }),
          'EX', 86400
        );
        await this.pauseAllNonCriticalFlows(event.tenantId);
        await this.setMaintenancePage(event.tenantId, true);
        await this.notifyDeveloper(event, triage, 'critical');
        return { scope: 'full', pausedFlows: [] };
    }
  }

  private async pauseAffectedFlows(flowIds: string[]): Promise<string[]> {
    // Uses existing PulseCore flow enable/disable mechanism
    const paused: string[] = [];
    for (const flowId of flowIds) {
      await this.grpc.disableFlow({ flowId, reason: 'PulseGuard: automatic maintenance pause' });
      paused.push(flowId);
    }
    return paused;
  }

  private async notifyDeveloper(event: GuardEvent, triage: TriageResult, urgency: string) {
    // Fires a PulseGrid Flow — uses your existing Slack/PagerDuty/Telegram connectors
    await this.flowRunner.triggerInternalFlow('guard:notify', {
      urgency,
      rootCause: triage.rootCause,
      confidence: triage.confidence,
      affectedScope: triage.maintenanceScope,
      source: event.source,
      alertUrl: `${process.env.ADMIN_URL}/guard/alerts/${event.id}`,
    });
  }
}
```

---

### 24.7 Layer 3B — Internet Research Engine

After initial triage, PulseGuard uses the Anthropic web search tool to cross-reference the error against live internet sources.

```typescript
// guard/src/research/internet-research.service.ts
@Injectable()
export class InternetResearchService {
  async research(event: GuardEvent, triage: TriageResult): Promise<ResearchResult> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `You are researching a production error for the PulseGuard system.
Search for CVEs, known bugs, and patches related to this error.
Focus on: security vulnerabilities, dependency version issues, known workarounds.
Return a JSON object: { "sources": [{ "url": "...", "relevance": "...", "summary": "..." }], "cve_ids": [], "recommended_dep_versions": {} }`,
      messages: [{
        role: 'user',
        content: `Research these queries for a production ${event.source} error:

Error: ${event.message}
Queries to investigate:
${triage.searchQueries.map(q => `- ${q}`).join('\n')}

Dependencies in play (from affected files):
${await this.getDependencyVersions(triage.affectedFilePath)}`,
      }],
    });

    // Extract text from potentially multi-turn tool-use response
    const finalText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as TextBlock).text)
      .join('');

    return JSON.parse(finalText) as ResearchResult;
  }
}
```

---

### 24.8 Layer 4 — Developer Review Panel

GuardAlert cards appear in the Angular admin at `/admin/guard`. Each card surfaces the full diagnostic picture and the proposed fix.

#### Angular component structure

```typescript
// admin/src/app/guard/guard-alert-card.component.ts
@Component({
  selector: 'app-guard-alert-card',
  template: `
    <div class="guard-card" [class]="'severity-' + alert.severity.toLowerCase()">

      <div class="guard-header">
        <span class="severity-badge">{{ alert.severity }}</span>
        <span class="source-tag">{{ alert.source }}</span>
        <span class="timestamp">{{ alert.createdAt | date:'medium' }}</span>
        <span class="confidence">AI confidence: {{ (alert.aiConfidence * 100).toFixed(0) }}%</span>
      </div>

      <h3 class="root-cause">{{ alert.aiDiagnosis?.root_cause }}</h3>

      <div class="explanation">{{ alert.aiDiagnosis?.explanation }}</div>

      <!-- Web-sourced context -->
      <div class="web-sources" *ngIf="alert.webSources?.sources?.length">
        <h4>Internet research</h4>
        <div *ngFor="let source of alert.webSources.sources" class="source-item">
          <a [href]="source.url" target="_blank">{{ source.url }}</a>
          <p>{{ source.summary }}</p>
        </div>
        <div *ngIf="alert.webSources.cve_ids?.length" class="cve-list">
          CVEs: {{ alert.webSources.cve_ids.join(', ') }}
        </div>
      </div>

      <!-- Code suggestion diff -->
      <div class="code-suggestion" *ngIf="alert.codeSuggestion">
        <h4>Suggested fix — {{ alert.codeSuggestion.file_path }}</h4>
        <div class="diff-viewer">
          <pre class="diff-remove">{{ alert.codeSuggestion.original_snippet }}</pre>
          <pre class="diff-add">{{ alert.codeSuggestion.suggested_snippet }}</pre>
        </div>
        <p class="diff-explanation">{{ alert.codeSuggestion.explanation }}</p>
      </div>

      <!-- Maintenance scope -->
      <div class="maintenance-info" *ngIf="alert.maintenanceScope">
        <strong>Maintenance action taken:</strong>
        {{ formatMaintenanceScope(alert.maintenanceScope) }}
      </div>

      <!-- Actions -->
      <div class="guard-actions">
        <button class="btn-primary" (click)="createGithubIssue(alert)">
          Create GitHub issue + branch
        </button>
        <button class="btn-secondary" (click)="acknowledge(alert)">
          Acknowledge
        </button>
        <button class="btn-resolve" (click)="resolve(alert)">
          Mark resolved
        </button>
        <button class="btn-dismiss" (click)="dismiss(alert)">
          Dismiss
        </button>
      </div>

    </div>
  `,
})
export class GuardAlertCardComponent {
  @Input() alert!: GuardAlert;

  async createGithubIssue(alert: GuardAlert) {
    // Triggers PulseGrid's existing GitHub connector
    await this.guardService.createGithubIssueFromAlert(alert.id);
  }
}
```

#### GitHub issue creation via existing connector

```typescript
// guard/src/actions/github-action.service.ts
@Injectable()
export class GuardGithubActionService {
  async createIssueAndBranch(alert: GuardAlert): Promise<string> {
    // Uses PulseGrid's own GitHub connector — no new integration needed
    const issueResult = await this.connectorRuntime.execute({
      connector: 'github',
      action: 'create_issue',
      credentials: await this.vault.getSystemCredentials('github'),
      input: {
        owner: process.env.GITHUB_ORG,
        repo: process.env.GITHUB_REPO,
        title: `[PulseGuard] ${alert.severity}: ${alert.aiDiagnosis.root_cause}`,
        body: this.formatIssueBody(alert),
        labels: ['pulseguard', `severity:${alert.severity.toLowerCase()}`, 'bug'],
      },
    });

    return issueResult.html_url;
  }

  private formatIssueBody(alert: GuardAlert): string {
    return `
## PulseGuard Automatic Report

**Source:** ${alert.source}
**Severity:** ${alert.severity}
**AI Confidence:** ${(alert.aiConfidence * 100).toFixed(0)}%
**Detected at:** ${alert.createdAt.toISOString()}

## Root Cause
${alert.aiDiagnosis.explanation}

## Suggested Fix
**File:** \`${alert.codeSuggestion?.file_path}\`

\`\`\`diff
- ${alert.codeSuggestion?.original_snippet}
+ ${alert.codeSuggestion?.suggested_snippet}
\`\`\`

**Rationale:** ${alert.codeSuggestion?.explanation}

## Internet Research
${alert.webSources?.sources?.map(s => `- [${s.url}](${s.url}): ${s.summary}`).join('\n') ?? 'No sources found.'}

${alert.webSources?.cve_ids?.length ? `**CVEs:** ${alert.webSources.cve_ids.join(', ')}` : ''}

## Maintenance Action
${JSON.stringify(alert.maintenanceScope, null, 2)}

---
*Auto-generated by PulseGuard. Human review required before applying any fix.*
    `;
  }
}
```

---

### 24.9 API Endpoints (guard/ microservice)

```
GET    /guard/alerts                   List all GuardAlerts (paginated, filterable by severity/status)
GET    /guard/alerts/:id               Full alert detail including AI diagnosis and web sources
PATCH  /guard/alerts/:id/acknowledge   Acknowledge an alert (sets status: acknowledged)
PATCH  /guard/alerts/:id/resolve       Mark resolved (sets status: resolved, records resolver)
PATCH  /guard/alerts/:id/dismiss       Dismiss (sets status: dismissed)
POST   /guard/alerts/:id/github        Create GitHub issue + branch from alert
GET    /guard/maintenance              Current maintenance state for tenant
DELETE /guard/maintenance              Manually clear maintenance mode (with reason)
GET    /guard/health                   PulseGuard service health
GET    /guard/index/status             Codebase index status (last rebuilt, file count)
POST   /guard/index/rebuild            Trigger manual codebase index rebuild
WS     /guard/stream                   Real-time GuardAlert stream for admin panel
```

---

### 24.10 Integration Into the Development Roadmap

PulseGuard is designed to be integrated progressively. It does not require the full platform to be built before providing value.

#### Phase 2 entry point (recommended first integration)

Wire PulseGuard against the NestJS gateway only. This immediately gives you AI-powered error triage for Bull queue failures and API errors — the most common production pain points — with zero dependency on PulseCore gRPC changes.

**Phase 2 PulseGuard deliverables (2 weeks of effort):**
- `guard/` NestJS microservice deployed alongside `api-gateway/`
- NestJS Bull queue error collector live
- Spring Boot Actuator polling collector live
- Next.js error boundary beacon live
- AI triage engine wired to Anthropic API
- Internet research engine live
- GuardAlert table + basic Angular admin page at `/admin/guard`
- Slack/Telegram notification on every Error or Critical event

#### Phase 3 extension

Extend into PulseCore via the `GuardStream` gRPC definition. This brings in Rust-level panics, OOM events, and timeout signals — the deepest and most dangerous class of production errors.

**Phase 3 PulseGuard additions (2 weeks of effort):**
- `GuardStream` gRPC added to `core-proto`
- `GuardEventLayer` tracing subscriber in `core-engine`
- Codebase indexer (Rust + tree-sitter) running on startup and every 15 minutes
- Context builder with similarity lookup against `guard.codebase_index`
- GitHub issue + branch creation action live
- Full diff viewer in Angular GuardAlert card
- Maintenance mode with granular flow-level scope live

#### Phase 4 / Enterprise additions

- Tenant-scoped GuardAlert dashboards (enterprise workspaces get their own view)
- Immutable audit trail of every PulseGuard action and every AI suggestion shown
- On-premise inference option: route triage through `core-ai` (ONNX) for orgs that cannot send code to external APIs
- GuardAlert webhook: fire a custom Flow when a Critical alert is created (users can build their own incident response pipelines on top of PulseGuard)
- SLA integration: if a GuardAlert remains unresolved past the tenant's SLA threshold, automatically escalate via PagerDuty

---

### 24.11 Repository Structure Addition

```
pulsegrid/
├── guard/                             # NEW — PulseGuard microservice (NestJS)
│   ├── src/
│   │   ├── collectors/                # Signal collectors per source
│   │   │   ├── nestjs.collector.ts    # Bull queue error listener
│   │   │   ├── spring.collector.ts    # Actuator health poller
│   │   │   ├── pulsecore.collector.ts # gRPC GuardStream consumer
│   │   │   └── dashboard.collector.ts # Next.js error beacon receiver
│   │   ├── triage/
│   │   │   ├── ai-triage.service.ts   # Anthropic API triage call
│   │   │   └── context-builder.service.ts  # Codebase context enrichment
│   │   ├── research/
│   │   │   └── internet-research.service.ts # Web search via Anthropic tools
│   │   ├── maintenance/
│   │   │   └── orchestrator.service.ts # Maintenance mode logic
│   │   ├── actions/
│   │   │   └── github-action.service.ts # GitHub issue + branch creation
│   │   ├── guard.module.ts
│   │   ├── guard.controller.ts
│   │   └── guard.gateway.ts           # WebSocket gateway for real-time alerts
│   └── test/
│
├── core/
│   ├── core-engine/
│   │   └── src/
│   │       ├── guard_emitter.rs        # NEW — tracing Layer that emits GuardEvents
│   │       └── guard_indexer.rs        # NEW — tree-sitter codebase indexer
│   └── core-proto/
│       └── src/
│           └── guard.proto             # NEW — GuardStream gRPC definition
│
└── admin/
    └── src/app/
        └── guard/                     # NEW — GuardAlert Angular module
            ├── guard.module.ts
            ├── guard-alert-list.component.ts
            ├── guard-alert-card.component.ts
            └── guard-maintenance.component.ts
```

---

### 24.12 Security Considerations

**PulseGuard never sends full source files to the Anthropic API.** It sends only the output of the codebase indexer: parsed function signatures and error pattern strings. Raw business logic, credential handling code, and encryption implementation details are excluded from the index by a blocklist:

```rust
// core-engine/src/guard_indexer.rs
const INDEX_EXCLUDE_PATTERNS: &[&str] = &[
    "core-vault/",        // Encryption implementation
    "core/src/auth/",     // Authentication logic
    "**/*secret*",        // Any file with 'secret' in name
    "**/*credential*",    // Any credential handling file
    ".env*",              // Environment files
];
```

**All GuardAlert data is tenant-isolated.** The `guard.alerts` table includes `tenant_id` and every query is scoped to the authenticated workspace. Enterprise tenants can enable on-premise inference to prevent any code context from leaving their network.

**Maintenance mode can always be manually overridden.** The `DELETE /guard/maintenance` endpoint allows a developer to immediately clear any PulseGuard-triggered maintenance state with a required reason string, which is written to the audit log.

---

*PulseGuard — Built on PulseCore's event bus. Powered by Anthropic. Reviewed by humans.*
