# Miner Detail Pages - Implementation Plan

**Date**: 2025-01-02  
**Epic**: `slot-watch-prr` - Detailed Miner Information and History

## Overview

This plan covers the implementation of detailed miner information pages, including individual miner detail views, historical data, and performance statistics.

## Related Issues

| ID | Title | Type | Status | Dependencies |
|----|-------|------|--------|--------------|
| `slot-watch-prr` | Detailed Miner Information and History | epic | open | - |
| `slot-watch-n3j` | Backend API for Miner History and Stats | task | **closed** | parent: prr |
| `slot-watch-1j2` | Individual Miner Detail Page | feature | open | blocked by n3j |
| `slot-watch-nh6` | Link to Miner Details from Listing and Block Views | feature | **closed** | related to 1j2 |

## Current State

### Frontend

**Route**: `/miners` (`client/src/routes/miners.tsx`)
- Lists all miners with basic stats from last 500 blocks
- Uses TanStack Router with network-aware loading

**Route**: `/miners/$publicKey` (`client/src/routes/miners/$publicKey.tsx`) - **NEW**
- Individual miner detail page with basic stats
- Reuses `getMinerStats` API to find miner data
- Shows: public key, blocks won (last 500), last tenure, version

**Component**: `Miners` (`client/src/components/miners/miners.tsx`)
- DataTable with columns: Miner (public key), Blocks won %, Last tenure, Version
- **Miner public key now links to `/miners/$publicKey`** (updated 2026-01-02)
- Uses `PublicKey` component for truncated display

**Miner info in block views**:
- `stacks-block-detail.tsx` shows miner public key, address hash, and node version
- **Miner public key now links to `/miners/$publicKey`** (updated 2026-01-02)

### Backend

**Endpoint**: `GET /:networkKey/miners` (`server/src/routes/blocks.routes.ts:292`)
- Returns `{ minerStats: { miners: [...] } }`
- Each miner: `{ publicKey, count, latestBlock, version }`

**Data functions** (`server/src/db/block-proposals.ts`):
- `fetchRecentMinerStats()` - aggregates last 500 blocks by miner
- `_fetchRecentMinerBlocks()` - queries block proposals with burn block joins
- Cached via `fetchRecentMinerBlocksCache`

### Database Schema

Miner data is stored in `block_proposals` table:
- `miner_public_key: varchar(66)` - indexed
- `server_version: varchar(255)`
- `burn_block_height: integer`

Also in `block_pushes`:
- `miner_public_key: varchar(66)` - indexed

## Implementation Plan

### Phase 1: Backend API for Miner History (`slot-watch-n3j`) - COMPLETED

**Completed 2026-01-03:**

**New endpoint**: `GET /:networkKey/miners/:publicKey`

Returns:
```typescript
interface MinerDetailResponse {
  miner: {
    publicKey: string;
    stats: {
      last500: { blocksWon: number; percentage: number };
      allTime: { blocksWon: number; firstSeen: string | null };
    };
    currentVersion: string | null;
    currentVersionShort: string | null;
    versionHistory: Array<{
      version: string;
      versionShort: string | null;
      firstSeen: string;
      lastSeen: string;
      blockCount: number;
    }>;
  };
  recentBlocks: Array<{
    burnBlockHeight: number;
    chainLength: number;
    signerSignatureHash: string;
    blockTimestamp: string;
    serverVersion: string | null;
    serverVersionShort: string | null;
    txCount: number;
  }>;
}
```

**Implementation details:**

1. **New routes file**: `server/src/routes/miners.routes.ts`
   - Dedicated routes file for miner endpoints
   - Full OpenAPI documentation with Effect Schema
   - Moved `/:networkKey/miners` listing endpoint here
   - Added `/:networkKey/miners/:publicKey` detail endpoint

2. **New query function**: `server/src/db/block-proposals.ts`
   - `fetchMinerDetail(networkKey, publicKey, db)` - fetches miner stats, version history, and recent blocks
   - `buildVersionHistory()` - helper to aggregate version usage over time

3. **New types**: `common/src/server-types.ts`
   - `MinerDetailResponseSchema` - full miner detail response
   - `MinerVersionHistorySchema` - version history entry
   - `MinerRecentBlockSchema` - recent block entry
   - `MinerWindowStatsSchema` - stats for time windows
   - Updated `MinersResponseSchema` to match actual API output

### Phase 2: Individual Miner Detail Page (`slot-watch-1j2`)

**New route**: `/miners/$publicKey` (`client/src/routes/miners/$publicKey.tsx`)

Following the pattern from `stx-blocks/$blockHash.tsx`:
- TanStack Router file-based routing
- Network-aware loader
- Fetch miner detail + recent blocks in parallel

**New component**: `MinerDetail` (`client/src/components/miners/miner-detail.tsx`)

Layout (following TUI design system from `UI-DESIGN.md`):
```
┌─────────────────────────────────────────────────────────┐
│ Miner: [truncated public key]                           │
│ Version: stacks-node 3.1.0.0.0                          │
├─────────────────────────────────────────────────────────┤
│ Performance Statistics                                   │
│ ───────────────────────────────────────────────────────  │
│ Blocks Won (last 500)    45 (9.0%)                       │
│ Blocks Won (last 1000)   87 (8.7%)                       │
│ First Seen               2024-06-15                      │
│ Total Blocks             1,234                           │
├─────────────────────────────────────────────────────────┤
│ Version History                                          │
│ ───────────────────────────────────────────────────────  │
│ [DataTable: version, first seen, last seen]              │
├─────────────────────────────────────────────────────────┤
│ Recent Blocks                                            │
│ ───────────────────────────────────────────────────────  │
│ [DataTable: BTC height, STX height, timestamp, link]     │
└─────────────────────────────────────────────────────────┘
```

**API client addition** (`client/src/lib/slots-api.ts`):
```typescript
export async function getMinerDetail(networkKey: string, publicKey: string) {
  const response = await apiClient[':networkKey'].miners[':publicKey'].$get({
    param: { networkKey, publicKey },
  });
  return response.json();
}
```

### Phase 3: Link from Existing Views (`slot-watch-nh6`) - COMPLETED

**Completed 2026-01-02:**

1. **Miners listing** (`client/src/components/miners/miners.tsx`):
   - Wrapped `PublicKey` in `Link` to `/miners/$publicKey`
   - Added `hover:underline` class for visual feedback

2. **Block detail** (`client/src/components/stacks-block/stacks-block-detail.tsx`):
   - Made miner public key a link to `/miners/$publicKey`
   - Added `hover:underline` class for visual feedback

3. **Created basic miner detail route** (`client/src/routes/miners/$publicKey.tsx`):
   - Placeholder page using existing `getMinerStats` API
   - Shows basic stats (blocks won, last tenure, version)
   - Will be enhanced when backend API (`slot-watch-n3j`) is complete

**Link pattern used**:
```tsx
<Link to="/miners/$publicKey" params={{ publicKey: block.minerPublicKey }}>
  <PublicKey publicKey={block.minerPublicKey} />
</Link>
```

## File Changes Summary

### New Files
- `client/src/routes/miners/$publicKey.tsx` - route handler (CREATED - basic version)
- `client/src/components/miners/miner-detail.tsx` - detail component (pending - for enhanced version)
- `server/src/routes/miners.routes.ts` - dedicated miners routes with OpenAPI docs (DONE)

### Modified Files
- `server/src/db/block-proposals.ts` - add miner query functions (DONE)
- `common/src/server-types.ts` - add miner detail types (DONE)
- `server/src/server.ts` - mount miners routes (DONE)
- `server/src/routes/blocks.routes.ts` - removed miners endpoint (moved to miners.routes.ts) (DONE)
- `client/src/lib/slots-api.ts` - add getMinerDetail function (pending)
- `client/src/components/miners/miners.tsx` - add links (DONE)
- `client/src/components/stacks-block/stacks-block-detail.tsx` - add miner link (DONE)

## Implementation Order

1. **Backend first** (`slot-watch-n3j`) - **COMPLETED 2026-01-03**:
   - ~~Add database query functions~~ DONE
   - ~~Add API endpoint~~ DONE
   - ~~Add OpenAPI documentation~~ DONE
   - Test with manual API calls (pending deployment)

2. **Frontend detail page** (`slot-watch-1j2`):
   - Add API client function
   - Update route file to use new endpoint
   - Build enhanced detail component with version history and recent blocks
   - Test navigation

3. **Add links** (`slot-watch-nh6`) - **COMPLETED 2026-01-02**:
   - ~~Update miners listing~~ DONE
   - ~~Update block detail views~~ DONE
   - ~~Verify all links work~~ DONE
   - Note: Created basic `/miners/$publicKey` route that works with existing API

## Design Considerations

### TUI Aesthetic
- Use monospace fonts for technical data (public keys, versions, hashes)
- Sharp edges, no border-radius
- Lowercase action text
- Minimal decoration

### Existing Patterns to Follow
- `StacksBlockDetail` for layout structure
- `DataLabel`/`DataValue` for key-value pairs
- `PublicKey` component for truncated keys
- `Timestamp` component for dates
- `DataTable` for tabular data

### Performance
- Miner stats endpoint should be cached (like `fetchRecentMinerBlocksCache`)
- Recent blocks should support pagination if needed
- Consider lazy loading for version history

## Open Questions

1. **Pagination**: Should recent blocks list paginate? How many to show initially?
2. **Time windows**: Which time windows for stats? Last 500, 1000, all time?
3. **Sorting**: What default sort for recent blocks? (Likely newest first)
4. **Empty state**: What to show for miners with very few blocks?
5. **Mobile**: How should the detail page adapt to mobile?
