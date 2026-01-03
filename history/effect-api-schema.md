# Effect Schema + OpenAPI Migration

## Task: `slot-watch-4xk`

Refactor SlotWatch API to use Hono's OpenAPI integration with Effect Schema for validation.

## Completed Work

### 1. Dependencies Added
- **server**: `hono-openapi`, `@hono/standard-validator`, `postgres`, `bignumber.js`
- **common**: `effect`, `@effect/schema`, `@stacks/common`
- **client**: `ts-toolbelt`, `zod@^3.23.8`, `bignumber.js`

### 2. Converted Zod to Effect Schema (`common/src/server-types.ts`)

All schemas converted from Zod to Effect Schema. Key patterns:

```typescript
import { Schema } from 'effect';

// Basic struct with optional fields
export const BlockResponseApiSchema = Schema.Struct({
  signerSignatureHash: Schema.String,
  slotId: Schema.Number,
  chunkId: Schema.NullOr(Schema.String),  // nullable
  version: Schema.optional(Schema.String), // optional
  blockHeight: Schema.optional(Schema.Number),
});
export interface BlockResponseApi extends Schema.Schema.Type<typeof BlockResponseApiSchema> {}

// For mutable arrays (Effect Schema defaults to readonly)
replayTxs: Schema.NullOr(Schema.mutable(Schema.Array(Schema.String))),

// Union types
export const ApiStateMachineMinerStateSchema = Schema.Union(
  Schema.Struct({ variant: Schema.Literal(0) }),
  Schema.Struct({ variant: Schema.Literal(1), tenureId: Schema.String, ... })
);

// Record types
others: Schema.Record({
  key: Schema.String,
  value: Schema.NullOr(TimelineChunkOtherSchema),
}),
```

### 3. Fixed Effect Version Mismatch
- Aligned `effect` version to `^3.19.14` in both common and server packages
- This resolved Layer type inference issues

### 4. Updated `server/src/db/block-responses.ts`
- Changed from Zod `safeParse` to Effect Schema decode
- Due to cross-package type issues, schema is defined locally in server:

```typescript
import { Schema, Either } from 'effect';

const BlockResponseApiSchema = Schema.Struct({ ... }); // local definition

const decodeBlockResponse = Schema.decodeUnknownEither(BlockResponseApiSchema);

function parseBlockResponse(result: string): BlockResponseApi | null {
  const parsed = parse(result);
  const result2 = decodeBlockResponse(parsed);
  if (Either.isLeft(result2)) return null;
  return result2.right;
}
```

### 5. Fixed `server/src/effect/runtime.ts`
Changed from `NodeRuntime.runMain` (returns void) to `Effect.runPromise` (returns Promise) for `waitUntil` compatibility.

### 6. Fixed TanStack Router Link
Changed `/stx-blocks/${block.blockHash}` to `/stx-blocks/$blockHash` with params.

### 7. Added API Response Schemas (`common/src/server-types.ts`)

Added composed response schemas for OpenAPI documentation:

```typescript
// API Response schemas for OpenAPI documentation
export const BurnBlocksResponseSchema = Schema.Struct({
  burnBlocks: Schema.Array(ApiBurnBlockSchema),
}).annotations({ identifier: 'BurnBlocksResponse' });

export const TenureChangesResponseSchema = Schema.Struct({
  tenureChanges: Schema.Array(ApiStacksBlockSchema),
}).annotations({ identifier: 'TenureChangesResponse' });

export const BlockResponsesResponseSchema = Schema.Struct({
  responses: Schema.Array(BlockResponseApiSchema),
}).annotations({ identifier: 'BlockResponsesResponse' });

export const BlockProposalWithResponsesSchema = Schema.Struct({
  blockProposal: ApiBlockProposalSchema,
  responses: Schema.Array(BlockResponseApiSchema),
}).annotations({ identifier: 'BlockProposalWithResponses' });

export const StxBlockResponseSchema = Schema.Struct({
  stacksBlock: ApiStacksBlockSchema,
  proposal: ApiBlockProposalSchema,
}).annotations({ identifier: 'StxBlockResponse' });
```

### 8. Refactored `blocks.routes.ts` to Use hono-openapi

Replaced Zod validators with Effect Schema and added OpenAPI documentation:

```typescript
import { Schema } from 'effect';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { BurnBlocksResponseSchema, ... } from 'slot-watch-common';

// Request param/query schemas (local to routes)
const ConsensusHashParamSchema = Schema.standardSchemaV1(
  Schema.Struct({
    consensusHash: Schema.String,
    networkKey: Schema.String,
  }).annotations({ identifier: 'ConsensusHashParam' })
);

// Standard Schema wrappers for OpenAPI resolver
const burnBlocksResponse = Schema.standardSchemaV1(BurnBlocksResponseSchema);

// Route with OpenAPI documentation
.get(
  '/burn-blocks/:networkKey',
  describeRoute({
    description: 'Get recent burn blocks for a network',
    responses: {
      200: {
        description: 'List of recent burn blocks',
        content: {
          'application/json': { schema: resolver(burnBlocksResponse) },
        },
      },
    },
  }),
  async (c) => { ... }
)
```

**Key pattern notes:**
- Request param/query schemas stay local to the route file
- Response schemas live in `common/src/server-types.ts`
- Use `Schema.standardSchemaV1()` to wrap schemas for hono-openapi
- Use `.annotations({ identifier: 'SchemaName' })` for OpenAPI schema naming

### 9. Added OpenAPI Spec Endpoint (`server/src/server.ts`)

```typescript
import { openAPIRouteHandler } from 'hono-openapi';

.get(
  '/openapi.json',
  openAPIRouteHandler(api, {
    documentation: {
      info: {
        title: 'SlotWatch API',
        version: '1.0.0',
        description: 'API for monitoring Stacks blockchain signers and blocks',
      },
      tags: [
        { name: 'Burn Blocks', description: 'Bitcoin burn block operations' },
        { name: 'Stacks Blocks', description: 'Stacks block proposals and responses' },
        { name: 'Signers', description: 'Signer information and statistics' },
        { name: 'State Machines', description: 'Signer state machine updates' },
        { name: 'Miners', description: 'Miner statistics and activity' },
      ],
    },
  })
)
```

### 10. Complete OpenAPI Documentation for All Routes

All API routes now have complete OpenAPI documentation with:
- **Summary**: Short description for API listings
- **Description**: Detailed explanation of the endpoint
- **Tags**: Categorization for API documentation UI
- **Response schemas**: Typed response bodies using Effect Schema

Routes converted:
- `blocks.routes.ts` - All endpoints documented with tags: Burn Blocks, Stacks Blocks, Miners
- `signers.routes.ts` - All endpoints documented with tag: Signers
- `recents.routes.ts` - All endpoints documented with tag: Signers
- `state-machine.routes.ts` - All endpoints documented with tag: State Machines

### 11. Additional Response Schemas Added

New schemas added to `common/src/server-types.ts`:

```typescript
// SignerDashboardItem for signers-dashboard response
export const SignerDashboardItemSchema = Schema.Struct({
  publicKey: Schema.String,
  weight: Schema.Number,
  weightPercent: Schema.Number,
  weightPercentStr: Schema.String,
  name: Schema.NullOr(Schema.String),
  stackedAmount: Schema.String,
  stackedAmountStx: Schema.Number,
  label: Schema.String,
}).annotations({ identifier: 'SignerDashboardItem' });

// StateMachinesResponse
export const StateMachinesResponseSchema = Schema.Struct({
  latestStateMachineUpdates: Schema.mutable(Schema.Array(ApiStateMachineUpdateSchema)),
}).annotations({ identifier: 'StateMachinesResponse' });

// StateMachineUpdatesResponse (paginated)
export const StateMachineUpdatesResponseSchema = Schema.Struct({
  lastId: Schema.optional(Schema.String),
  next: Schema.String,
  stateMachines: Schema.mutable(Schema.Array(ApiStateMachineUpdateSchema)),
}).annotations({ identifier: 'StateMachineUpdatesResponse' });

// MinersResponse
export const MinersResponseSchema = Schema.Struct({
  minerStats: Schema.mutable(Schema.Array(MinerStatsSchema)),
}).annotations({ identifier: 'MinersResponse' });

// BurnBlockBlocksResponse (blocks in a tenure)
export const BurnBlockBlocksResponseSchema = Schema.Struct({
  blocks: Schema.mutable(Schema.Array(Schema.Struct({
    proposal: ApiBlockProposalSchema,
    stacksBlock: Schema.NullOr(ApiStacksBlockSchema),
  }))),
}).annotations({ identifier: 'BurnBlockBlocksResponse' });

// BurnBlockResponse (single burn block)
export const BurnBlockResponseSchema = Schema.Struct({
  btcBlock: Schema.NullOr(ApiBurnBlockSchema),
}).annotations({ identifier: 'BurnBlockResponse' });
```

## Key Files

- `common/src/server-types.ts` - All API schemas (Effect Schema) + response schemas
- `server/src/routes/blocks.routes.ts` - Block and burn block endpoints
- `server/src/routes/signers.routes.ts` - Signer endpoints
- `server/src/routes/recents.routes.ts` - Recent signer activity endpoints
- `server/src/routes/state-machine.routes.ts` - State machine endpoints
- `server/src/server.ts` - OpenAPI endpoint and Scalar docs UI
- `client/src/lib/slots-api.ts` - Add return types (remaining work)

## Reference Docs

- Effect Schema: `~/stacker/effect-docs/content/src/content/docs/docs/schema/`
- hono-openapi with Effect: https://honohub.dev/docs/openapi/effect
- Standard Schema conversion: `Schema.standardSchemaV1(schema)`

## Current Status

- [x] Dependencies installed
- [x] Zod schemas converted to Effect Schema
- [x] Type errors fixed
- [x] Response schemas added to common package
- [x] Routes refactored to use hono-openapi
  - [x] blocks.routes.ts
  - [x] signers.routes.ts
  - [x] recents.routes.ts
  - [x] state-machine.routes.ts
- [x] OpenAPI endpoint added
- [x] All routes have summary, description, and tags
- [x] Scalar docs UI added at /docs
- [ ] Client return types added

## Endpoints NOT documented (by design)

The following route files are excluded from OpenAPI documentation:
- `chunks.routes.ts` - Internal/debug endpoints
- `events.routes.ts` - SSE streaming endpoints
- `health.routes.ts` - Infrastructure health checks
- `metrics.routes.ts` - Prometheus metrics

## Next Steps

### 1. Add Explicit Return Types to `client/src/lib/slots-api.ts`

Functions need explicit return types using types from common package. Example:

```typescript
import type { BurnBlocksResponse, BlockProposalWithResponses } from 'slot-watch-common';

export async function getBurnBlocks(networkKey: string): Promise<BurnBlocksResponse> {
  // ...
}
```
