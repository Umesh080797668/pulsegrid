# PulseGrid Phase 2 Stubs & Scaffolding

## Overview

Phase 2 (current) implements architectural scaffolding for two major features:
1. **#7 - PulseAI Pattern Detection** (ML-based automation suggestions)
2. **#8 - Billing / Pro Plan** (Usage metering and plan enforcement)

Both features have **endpoints, database tables, and helper functions in place**, but with **stub implementations pending Phase 3-4**. This document tracks what's complete, what's scaffolded, and what's missing.

---

## Feature #7: PulseAI Pattern Detection

### Status: **STUB - Statistical Analysis Only**

Pattern detection exists at the statistical level only. No machine learning integration yet.

### Current Implementation (Phase 2)

#### 1. Core Analysis Module
**File:** `core/core-ai/src/lib.rs`  
**Function:** `analyze_event_history(tenant_id, events) -> Vec<Pattern>`

- ✅ **Detects Time-Based Patterns**: Groups events by hour; identifies repeated actions
- ✅ **Detects Event Correlations**: Finds events occurring within 10-min windows
- ✅ **Detects Anomalies**: Uses standard deviation to find spikes/outliers
- ❌ **ML Models**: No ONNX model loading, no tract crate dependency
- ❌ **Temporal Dependencies**: Doesn't learn sequences or temporal relationships
- ❌ **Confidence Scoring**: Uses simple heuristics, not model probabilities

**Placeholder Location:** Line 49  
```rust
// placeholder for tract ONNX integration
```

#### 2. REST Endpoints
**File:** `core/core-engine/src/main.rs`

| Endpoint | Method | Status | Purpose |
|----------|--------|--------|---------|
| `/api/v1/workspaces/{id}/patterns` | GET | ✅ IMPLEMENTED | Retrieve detected patterns from `ai_detected_patterns` table |

#### 3. gRPC Service
**File:** `core/core-proto/proto/pulsecore.proto`

```protobuf
service PulseCoreService {
  rpc DetectPatterns (DetectPatternsRequest) returns (DetectPatternsResponse);
}

message DetectedPattern {
  string id = 1;
  string pattern_type = 2;  // RepeatedAction, EventCorrelation, Anomaly, TimeBased
  float confidence = 5;
  string suggested_trigger = 7;
  // ... other fields
}
```

**Status:** ✅ Proto messages defined, ❌ RPC not yet implemented in core-engine

#### 4. Database Schema
**File:** `core/core-engine/migrations/20260429130000_usage_and_ai_patterns.sql`

```sql
CREATE TABLE ai_detected_patterns (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  pattern_type VARCHAR(50),
  description TEXT,
  confidence REAL,
  frequency VARCHAR(100),
  events_involved JSONB,
  suggested_trigger TEXT,
  suggested_actions JSONB,
  suggested_flow JSONB,
  detected_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_ai_patterns_workspace_date 
  ON ai_detected_patterns(workspace_id, detected_at DESC);
```

**Status:** ✅ Tables created

#### 5. Event Processing Integration
**File:** `core/core-engine/src/main.rs`  
**Function:** `start_event_listener()`

**Current:** Pattern detection trigger added at line ~720
```rust
// STUB: Trigger batch pattern detection (every 100 events)
// TODO: Call analyze_event_history() and store to ai_detected_patterns table
if event_count % 100 == 0 && event_count > 0 {
    eprintln!("[STUB] Trigger batch pattern detection - not yet implemented");
}
```

**Status:** ⚠️ Placeholder code in place, no actual execution

#### 6. GraphQL Subscriptions
**File:** `api-gateway/src/graphql/resolvers.ts`

**Current Resolvers (STUB):**
- `@Query() detectedPatterns()` → Returns empty array
- `@Mutation() suggestFlowFromPattern()` → Placeholder

**Status:** ❌ Not yet implemented in Phase 2

### Missing for Full Implementation

#### Phase 3: ML Integration (Tract ONNX)
1. **Dependencies:**
   - Add `tract = "0.21"` to `core/Cargo.toml`
   - Build ONNX model (or use pre-trained time-series model)
   - Load model from bytes or file path

2. **Code Changes:**
   - Replace `detect_time_based_patterns()` with ONNX inference
   - Replace `detect_event_correlations()` with learned correlation detection
   - Replace `detect_anomalies()` with neural network anomaly scoring
   - Implement recurrent architectures (LSTM, GRU) for sequence detection

3. **Performance:**
   - Model inference latency management
   - Batch processing for bulk historical analysis
   - Caching strategy for frequently accessed patterns

4. **Evaluation:**
   - Add confidence scoring from model output probabilities
   - Implement multi-model ensemble for better accuracy
   - User feedback loop for pattern validation

#### Phase 4: Advanced Features
1. User-defined pattern rules engine
2. Cross-workspace pattern sharing/templates
3. Pattern recommendation API
4. Real-time pattern streaming to UI

---

## Feature #8: Billing / Pro Plan

### Status: **STUB - Enforcement Infrastructure Only**

Billing table structure and plan enforcement checks are in place, but no Stripe integration yet.

### Current Implementation (Phase 2)

#### 1. Plan Limit Configuration
**File:** `core/core-engine/src/main.rs`  
**Function:** `plan_limits(plan: &str) -> PlanLimits`

```rust
struct PlanLimits {
    max_flows: i32,                    // 5 (free) → 50 (pro) → 500 (business)
    max_events_per_month: i32,         // 1,000 → 50,000 → 500,000
    max_connectors: i32,               // 3 → 10 → 100
    allowed_connector_tier: &'static str, // "free", "pro", "business"
}
```

**Constants Defined:**
- `FREE_CONNECTORS: &[&str]` - 15 connectors (Gmail, Slack, GitHub, etc.)
- `PRO_CONNECTORS: &[&str]` - 17 connectors (Shopify, Stripe, HubSpot, etc.)
- `BUSINESS_CONNECTORS` - All connectors

**Status:** ✅ Constants and mapping complete

#### 2. REST Endpoints
**File:** `core/core-engine/src/main.rs`

| Endpoint | Method | Status | Purpose |
|----------|--------|--------|---------|
| `/api/v1/workspaces/{id}/upgrade` | POST | ⚠️ PARTIAL | Updates plan (no Stripe sync) |
| `/api/v1/workspaces/{id}/billing/usage` | GET | ✅ IMPLEMENTED | Current month usage report |
| `/api/v1/stripe/webhook` | POST | ⚠️ STUB | Webhook receiver (no verification) |

#### 3. Enforcement Points
**File:** `core/core-engine/src/main.rs`

| Function | Call Site | Status | Behavior |
|----------|-----------|--------|----------|
| `enforce_flow_limit()` | `create_flow()` | ✅ WIRED | Returns 402 if at limit |
| `enforce_connector_limit()` | `upsert_credential()` | ✅ WIRED | Checks tier + count, returns 402 |
| `enforce_event_quota()` | `webhook_receiver()` | ✅ WIRED | Returns 429 if monthly quota exceeded |

**Example Enforcement:**
```rust
// In create_flow()
enforce_flow_limit(&state.pool, payload.workspace_id).await?;

// In webhook_receiver()
enforce_event_quota(&state.pool, workspace_id).await?;
let _ = increment_usage(&state.pool, workspace_id, 1, 0).await; // +1 event
```

**Status:** ✅ Enforcement integrated, ⚠️ Counting logic depends on event ingestion

#### 4. Usage Metering
**File:** `core/core-engine/src/main.rs`

**Functions:**
- `get_monthly_usage(pool, workspace_id) -> (event_count, flow_run_count)` ✅
- `increment_usage(pool, workspace_id, event_delta, flow_run_delta)` ✅
- `month_start_utc() -> NaiveDate` - Returns first day of current month ✅

**Usage Counter Table:**
```sql
CREATE TABLE usage_counters (
  workspace_id UUID NOT NULL,
  usage_month DATE NOT NULL,
  event_count BIGINT DEFAULT 0,
  flow_run_count BIGINT DEFAULT 0,
  connector_count INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (workspace_id, usage_month)
);
```

**Status:** ✅ Tables and functions in place

#### 5. Database Schema
**File:** `core/core-engine/migrations/20260429130000_usage_and_ai_patterns.sql`

**Existing Tables (Phase 1):**
- `workspaces.plan` - VARCHAR field for tier (free/pro/business/enterprise)
- `billing_subscriptions.plan_tier` - VARCHAR field for tier

**New Tables (Phase 2):**
- `usage_counters` - Monthly usage tracking by workspace
- `ai_detected_patterns` - Pattern storage

**Fields Added:**
- `billing_subscriptions.metadata` - JSONB for Stripe subscription data

**Status:** ✅ Schema created and migrated

### Missing for Full Implementation

#### Phase 3: Stripe Webhook Integration
1. **Webhook Handler** (`stripe_webhook_handler()` at line ~1905)
   - ✅ Endpoint exists
   - ❌ Signature verification not implemented
   - ❌ Event handlers are stubs:
     ```rust
     match event_type {
         "customer.subscription.created" => {
             // TODO: Extract IDs, update billing_subscriptions
         },
         "customer.subscription.updated" => {
             // TODO: Update plan_tier and status
         },
         "customer.subscription.deleted" => {
             // TODO: Set status to 'canceled', revert to free
         },
         "invoice.payment_failed" => {
             // TODO: Set status, notify user
         },
     }
     ```

2. **Missing API Calls:**
   - No Stripe customer creation during workspace upgrade
   - No subscription creation when upgrading
   - No subscription cancellation when downgrading
   - No payment retry logic

3. **Missing Dependencies:**
   - `stripe = "0.15"` crate not in Cargo.toml
   - STRIPE_WEBHOOK_SECRET environment variable not used
   - Stripe API key management not implemented

#### Phase 4: Complete Billing Lifecycle
1. **Customer Management:**
   - Create Stripe customer on workspace creation
   - Link customer ID to workspaces table
   - Handle customer deletion/archiving

2. **Subscription Lifecycle:**
   - Upgrade path: Free → Pro → Business
   - Downgrade path with data retention
   - Pause/resume subscriptions
   - Trial period management (14 days default)

3. **Invoice & Payment:**
   - Generate invoices for Pro/Business tiers
   - Proration for mid-cycle changes
   - Retry failed payments (3 attempts)
   - Invoice webhooks for accounting sync

4. **Usage Enforcement:**
   - Soft limit warnings at 80% quota
   - Hard limit blocks at 100% (returns 429)
   - Grace period for overage events (24 hours)
   - Monthly reset on first of month (UTC)

5. **Plan-Specific Gating:**
   - Connector tier restrictions in flow creation validation
   - Event quota checks before flow execution
   - Flow count checks before deployment
   - Connector count checks before credential creation

### Stub Status Summary

| Component | Phase 2 | Phase 3 | Phase 4 |
|-----------|---------|---------|---------|
| Plan limits config | ✅ | - | - |
| Usage tracking | ✅ | - | - |
| Enforcement checks | ✅ | - | - |
| REST endpoints | ⚠️ | ✅ | ✅ |
| Stripe webhooks | ⚠️ | ✅ | ✅ |
| Subscription lifecycle | ❌ | ✅ | - |
| Payment processing | ❌ | ⚠️ | ✅ |
| Notifications | ❌ | ⚠️ | ✅ |

---

## Roadmap

### Phase 2 (Current)
- [x] Plan limit constants and helper functions
- [x] Usage tracking tables and queries
- [x] Enforcement point integration into create_flow/upsert_credential/webhook_receiver
- [x] Pattern detection database schema
- [x] Stripe webhook endpoint (stub)
- [x] REST endpoints for patterns and usage reporting

### Phase 3 (Next)
- [ ] Stripe API integration (create/cancel/update subscriptions)
- [ ] Webhook signature verification with HMAC
- [ ] Subscription lifecycle event handlers
- [ ] ML-based pattern detection (tract ONNX)
- [ ] gRPC detect_patterns() RPC implementation
- [ ] Invoice generation and payment retry logic

### Phase 4 (Future)
- [ ] Advanced billing features (proration, trials, grace periods)
- [ ] Multi-tier pricing model with seat-based licensing
- [ ] Self-serve usage dashboard in API Gateway
- [ ] Billing audit logs and compliance reporting
- [ ] Advanced ML pattern models (ensemble, real-time detection)
- [ ] Pattern recommendation engine with user feedback loop

---

## Testing

### Pattern Detection
```bash
# List detected patterns (currently empty)
curl GET http://localhost:8000/api/v1/workspaces/{workspace_id}/patterns

# Should see empty array until patterns are actually detected
{"patterns": [], "total": 0}
```

### Billing Enforcement
```bash
# Check workspace usage
curl GET http://localhost:8000/api/v1/workspaces/{workspace_id}/billing/usage

# Response shows limits and current usage
{
  "plan": "free",
  "current_month": {
    "events_count": 42,
    "events_limit": 1000
  },
  "limits": {
    "max_flows": 5,
    "max_events_per_month": 1000,
    "max_connectors": 3
  }
}

# Create flow when at limit (should fail)
curl POST http://localhost:8000/api/v1/flows \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "workspace_id": "..."}' 
# Returns 402 Payment Required when at flow limit
```

### Stripe Webhooks
```bash
# Send test webhook (will print [STUB] message to logs)
curl POST http://localhost:8000/api/v1/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{"type": "customer.subscription.created", "data": {...}}'

# Returns 200 OK (but no actual processing)
{"received": true, "event_type": "customer.subscription.created"}
```

---

## Code Comments

All stub implementations are marked with one of these comment prefixes:

- `// STUB:` - Feature is scaffolded but not implemented
- `// TODO Phase N:` - Specific requirements for future phase
- `// BILLING:` - Billing-related enforcement
- `// PATTERN DETECTION:` - Pattern detection related

Search for these patterns in the codebase to find all stubs:
```bash
grep -r "STUB:" core/
grep -r "TODO Phase" core/
grep -r "BILLING:" core/
grep -r "PATTERN DETECTION:" core/
```

---

## Related Files

- **Billing Constants:** `core/core-engine/src/main.rs` lines 80-120
- **Usage Tracking:** `core/core-engine/src/main.rs` lines 150-240
- **Enforcement Functions:** `core/core-engine/src/main.rs` lines 240-300
- **Pattern Detection Module:** `core/core-ai/src/lib.rs` lines 12-150
- **Upgrade Handler:** `core/core-engine/src/main.rs` lines 1295-1340
- **Stripe Webhook:** `core/core-engine/src/main.rs` lines 1895-1945
- **Proto Definitions:** `core/core-proto/proto/pulsecore.proto`
- **Database Schema:** `core/core-engine/migrations/20260429130000_usage_and_ai_patterns.sql`

---

## Questions & Decisions

**Q: Why use runtime SQL instead of sqlx! macros?**  
A: The tables don't exist at compile time, so runtime queries with `.bind()` are necessary for the code to compile before the migration runs.

**Q: Why scaffold Stripe before integrating it?**  
A: This ensures the database schema and enforcement points are ready. Stripe integration can be added independently without refactoring.

**Q: How are pattern detection and billing related?**  
A: Both use monthly usage tracking. Pattern detection triggers are based on event counts from the billing system. This ensures ML analysis only runs when sufficient data is available.

**Q: What happens if a user exceeds quota mid-flow execution?**  
A: The webhook_receiver() checks quota before accepting the event. If exceeded, it returns 429 Too Many Requests and the event is not processed.

