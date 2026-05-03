# Business Plan Tier Implementation

## Configuration

The Business plan ($49/month) is now implemented across the entire PulseGrid stack.

### Environment Variables (for reference)

```bash
# Existing - Pro plan price
PRO_PRICE_ID=price_xxxxxxxxxxxx

# New - Business plan price (add to your .env)
BUSINESS_PRICE_ID=price_yyyyyyyyyyyy
```

### Business Tier Limits

- **Monthly Cost**: $49/month per workspace
- **Events per day**: 2,000,000
- **Events per month**: 60,000,000  
- **Max flows**: 500 (unlimited)
- **Max connectors**: 100
- **Max team members**: 25
- **Run history retention**: 1 year (365 days)
- **Connector access**: All tiers (Tier 1, 2, 3)
- **Advanced analytics**: Yes
- **Priority support**: Yes

### Comparison Matrix

| Feature | Free | Pro ($12) | Business ($49) |
|---------|------|-----------|---|
| Events/day | 1,000 | 100,000 | 2,000,000 |
| Events/month | 30,000 | 3,000,000 | 60,000,000 |
| Flows | 5 | 50 | 500 |
| Connectors | 3 | 10 | 100 |
| Team members | 1 | 3 | 25 |
| Run history | 7 days | 90 days | 1 year |
| Connector tiers | Tier 1 only | Tier 1 & 2 | All tiers |
| Analytics | Basic | Standard | Advanced |
| Support | Community | Email | Priority |

## Implementation Details

### 1. Enterprise Service (Java/Spring Boot)

**BillingService.java**
- Updated `getPlanLimits()` with comprehensive Business tier limits
- Stores plan config in Redis cache for PulseCore to read
- Persists subscription data in PostgreSQL

**PlanEnforcementService.java** (NEW)
- Runtime plan enforcement at 80% and 100% thresholds
- Checks against Redis-cached plan configuration
- Methods:
  - `canCreateFlow()` - flow count limit enforcement
  - `canIngestEvents()` - daily event quota enforcement
  - `canAddTeamMember()` - team member limit enforcement
  - `canAddConnector()` - connector limit enforcement
  - `isConnectorAllowed()` - connector tier validation
  - `getThresholdAlerts()` - generates alerts at usage thresholds

**PlanRedisRepository.java** (ENHANCED)
- New `getPlan()` method to retrieve cached plan config
- Returns default free plan if cache miss
- Supports multi-level failover

**UsageThresholdAlert.java** (NEW)
- DTO for threshold alerts
- Tracks: metric, current usage, limit, percentage, severity
- Includes suggested plan upgrade

### 2. Rust Core Engine (PulseCore)

**plan_limits()** function updated:
- Business tier: 60M events/month, 500 flows, 100 connectors, business connector tier
- Pro tier: 3M events/month, 50 flows, 10 connectors, pro connector tier
- Free tier: 30K events/month, 5 flows, 3 connectors, free connector tier
- Enterprise tier: 600M events/month, 5000 flows, 1000 connectors

Reads plan from Redis on every workspace operation for up-to-date enforcement.

### 3. Next.js Dashboard

**Billing Settings Page** (app/settings/billing/page.tsx)
- Three-tier plan card display with recommended badge on Business
- Plan comparison showing all limits side-by-side
- Upgrade prompts with plan-specific messaging
- Real-time subscription status polling
- Business plan benefits callout section

**Plan Card Component Features**:
- Visual tier indicators (Free/Pro/Business)
- Feature lists and limit comparison tables
- Upgrade/downgrade button state management
- Loading indicators during Stripe processing

## Database Schema

### PostgreSQL - enterprise_subscriptions table
```sql
- workspace_id (UUID, FK)
- stripe_customer_id (String)
- stripe_subscription_id (String)
- plan (String: 'free' | 'pro' | 'business' | 'enterprise')
- status (String: 'active' | 'past_due' | 'canceled')
- current_period_start (Instant)
- current_period_end (Instant)
- created_at, updated_at
```

### Redis Cache - tenant:{workspaceId}:plan
```json
{
  "plan": "business",
  "max_events_per_day": 2000000,
  "max_events_per_month": 60000000,
  "max_flows": 500,
  "max_connectors": 100,
  "max_team_members": 25,
  "allowed_connector_tier": "business",
  "run_history_days": 365,
  "advanced_analytics": true,
  "priority_support": true
}
```

## Upgrade Flow

1. User clicks "Upgrade to Business" in dashboard
2. Request sent to `/workspaces/{id}/upgrade` with plan="business"
3. PulseCore initiates Stripe subscription creation
4. Stripe webhook confirms with `customer.subscription.activated` event
5. Enterprise service receives event and updates:
   - `workspaces.plan` = "business"
   - `billing_subscriptions.plan_tier` = "business"
   - Cache plan config in Redis
6. Dashboard polls for final status and reflects new plan

## Usage Threshold Alerts

Dashboard monitors real-time usage and shows alerts:
- **80% threshold**: Warning alert (yellow)
- **100% threshold**: Critical alert (red)

Alerts calculated for:
- Daily events
- Monthly events
- Flows created
- Connectors configured
- Team members added

Example alert message:
> "You've used 1,600,000/2,000,000 daily events (80%). Upgrade your plan for higher limits."

## Monitoring & Enforcement

**PulseCore Runtime Checks**:
Every operation validates against plan limits read from Redis:
- Event ingestion returns 429 if daily quota exceeded
- Flow creation blocked if flow limit reached
- Connector validation blocks unsupported tiers
- Team member operations check member limits

**Dashboard Prompts**:
Real-time usage metrics displayed with:
- Progress bars toward plan limits
- Suggested plan upgrades
- Direct links to upgrade buttons

## Migration Path

### Free → Pro ($12/mo)
- 20x event quota increase
- 10x flow limit increase
- Connector access to Tier 2
- Standard analytics
- Email support

### Pro → Business ($49/mo)
- 20x more event quota
- 10x more flows
- Full connector tier access
- Advanced analytics
- Priority support

### Business → Enterprise (Custom)
- Unlimited flows
- Custom event quotas
- Dedicated CSM
- On-premise/white-label
