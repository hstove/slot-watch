# UI Improvements Session - 2024-12-29

## Current State Analysis

### Home Page Structure
- Header with navigation links (Extend, Signers, Miners, State Machines, Blocks)
- Network picker (Mainnet/Testnet)
- Theme toggle
- Main content: List of BTC burn blocks, each containing Stacks blocks

### Visual Observations from PlayWriter
- The header uses capitalized nav links ("Extend", "Signers", etc.)
- BTC blocks shown with height, hash, timestamp
- Stacks blocks in a grid: Height, Timestamp, Block Hash, Info columns
- Various data badges showing tx counts, fees, percentages

## UI Design System Compliance Check

Comparing current state against UI-DESIGN.md:

| Principle | Current | Target | Gap |
|-----------|---------|--------|-----|
| Lowercase actions | "Signers", "Miners" | "signers", "miners" | **Gap: nav links are capitalized** |
| Sharp edges | `rounded-lg` on containers | No border-radius | **Gap: using rounded corners** |
| Monospace technical | Partially applied | All technical data | Needs review |
| Card pattern | Custom styling | Specific header/content/footer | Needs alignment |

## Improvement Ideas

### 1. Header Nav Links Should Be Lowercase (Quick Win)
The UI design doc says "Lowercase actions" - the nav links currently say "Extend", "Signers", etc. but should be "extend", "signers", etc.

**Files to change:** `src/components/header.tsx`
**Effort:** Trivial
**Impact:** Aligns with TUI aesthetic

### 2. Remove Border Radius from Containers
The design doc says "Sharp edges - no border-radius on containers and buttons". The burn block uses `rounded-lg`.

**Files to change:** `src/components/blocks-v2/burn-block.tsx`
**Effort:** Small
**Impact:** Aligns with TUI aesthetic

### 3. Card Pattern Alignment
The current burn block doesn't follow the card pattern from the design doc (header with border-b, bg-muted/30, etc.)

**Effort:** Medium
**Impact:** More consistent visual hierarchy

## Selected Improvement

**Improvement #1: Lowercase nav links** is the quickest win and directly addresses a stated principle in the design doc.
