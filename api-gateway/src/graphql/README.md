# GraphQL API Documentation

## Overview

The GraphQL API serves as the BFF (Backend-for-Frontend) for PulseGrid's dashboard and mobile apps. It provides:

- **Type-safe queries** for flows, events, and patterns
- **N+1 prevention** via DataLoader batching
- **Real-time subscriptions** via WebSocket (connected to EventsGateway)
- **Resolver integration** with core-ai for pattern detection

## Architecture

```
┌─────────────────────────────────────────────────┐
│         Dashboard / Mobile Apps                 │
└──────────────┬──────────────────────────────────┘
               │ GraphQL Queries/Mutations
               ▼
┌─────────────────────────────────────────────────┐
│      Apollo Server (GraphQL API)                │
│  ┌────────────────────────────────────────┐    │
│  │  Context + DataLoaders                 │    │
│  │  - flowLoader (batches N flows)        │    │
│  │  - eventLoader (batches N events)      │    │
│  │  - flowRunsLoader (batches flow runs)  │    │
│  └────────────────────────────────────────┘    │
└────────┬──────────────┬──────────────┬──────────┘
         │              │              │
    gRPC │          gRPC │          gRPC │
         ▼              ▼              ▼
    ┌────────────┐ ┌──────────┐ ┌─────────┐
    │ PulseCore  │ │ core-ai  │ │ Events  │
    │  (flows)   │ │(patterns)│ │(WebSocket)
    └────────────┘ └──────────┘ └─────────┘
```

## DataLoader Implementation

### Why DataLoaders?

Without DataLoaders, fetching a workspace with 100 flows would trigger 100 separate queries:

```graphql
# Bad: N+1 queries
query {
  workspace(id: "ws-123") {
    flows {  # This triggers 100 separate DB queries
      id
      name
    }
  }
}
```

With DataLoaders, all 100 flow IDs are batched into a single query:

```sql
-- Good: Batched query
SELECT * FROM flows WHERE id = ANY(['flow-1', 'flow-2', ..., 'flow-100'])
```

### Available Loaders

```typescript
// In dataloaders.ts
- flowLoader: batch load flows by ID
- eventLoader: batch load events by ID
- flowRunsLoader: batch load flow runs (groups by flow_id)
- workspaceLoader: batch load workspaces by ID
```

## Example Queries

### Fetch Workspace with Flows

```graphql
query GetWorkspace {
  workspace(id: "ws-123") {
    id
    name
    flows(limit: 50) {
      id
      name
      description
      isActive
      recentRuns(limit: 5) {
        id
        status
        durationMs
        completedAt
      }
    }
    recentEvents(limit: 20) {
      id
      eventType
      data
      createdAt
    }
  }
}
```

### Get Detected Patterns

```graphql
query GetPatterns {
  detectedPatterns(workspaceId: "ws-123") {
    id
    patternType
    description
    confidence
    frequency
    suggestedTrigger
    suggestedActions
  }
}
```

### Create Flow from Pattern

```graphql
mutation SuggestFlow {
  suggestFlowFromPattern(patternId: "pattern-456") {
    id
    name
    steps {
      id
      type
      connector
      action
    }
  }
}
```

### Real-time Event Stream

```graphql
subscription OnEvent {
  eventReceived(workspaceId: "ws-123") {
    id
    eventType
    data
    createdAt
  }
}
```

## Integration Points

### 1. PulseCore gRPC

Flows, flow runs, and workspace data come from PulseCore via gRPC. Resolvers call:

```typescript
this.client.send('GetFlow', { id })
this.client.send('ListFlows', { workspaceId })
```

### 2. core-ai Service

Pattern detection results are fetched via gRPC:

```typescript
// Call core-ai to get detected patterns
const patterns = await this.coreAiService.analyzePatterns(workspaceId)
```

### 3. EventsGateway (WebSocket)

Subscriptions are connected to the existing WebSocket gateway for real-time updates.

## Testing

```bash
# Start GraphQL playground
npm run dev

# Navigate to http://localhost:3000/graphql

# Test a query
query {
  flows(workspaceId: "test") {
    id
    name
  }
}
```

## Next Steps

1. **Resolver Implementation**: Fill in TODO methods to call gRPC services
2. **Authentication**: Add JWT guard to resolvers
3. **Subscriptions**: Wire GraphQL subscriptions to EventsGateway
4. **Error Handling**: Implement Apollo error formatting
5. **Caching**: Add Redis-backed DataLoader cache for cross-request deduplication

## References

- [Apollo Server Docs](https://www.apollographql.com/docs/apollo-server/)
- [NestJS GraphQL](https://docs.nestjs.com/graphql/quick-start)
- [DataLoader Pattern](https://github.com/graphql/dataloader)
- [N+1 Query Problem](https://stackoverflow.com/questions/97197/what-is-the-n1-selects-problem-in-orm-orm-mapping)
