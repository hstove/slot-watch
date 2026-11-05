<!-- Adapted from HumanLayer's visual-pr template (https://github.com/humanlayer/skills, MIT). Delete every comment and every section that doesn't apply before publishing. -->

[Issue #{N}](https://github.com/hstove/slot-watch/issues/{N}) | [{OTHER RELEVANT LINK}]({url})

## Why the change

{Exactly one sentence: the problem this PR solves and what becomes possible once it ships.}

## Special things to note

- {1-3 reviewer-relevant bullets: migrations (state clearly that they have NOT been run), breaking API changes, deploy ordering, deliberate omissions, surprising decisions. Write "None." when there is nothing.}

## Screenshots

<!-- Required for any visible UI change. Omit for changes with no visible effect. Name the page and the state shown. -->

**{Page or component, e.g. /signers header}**

| Before | After |
| --- | --- |
| <img src="{before url}" width="600"> | <img src="{after url}" width="600"> |

<!-- For motion, interaction or live updates, use a GIF instead of (or as well as) the table:

**{What the recording shows}**

<img src="{gif url}" width="800">

[Full-quality recording (WebM)]({webm url})
-->

## Change outline

{Use the smallest combination of `show-me` views (see references/show-me.md) that explains the implementation, each with a one-line lead-in. Prefer `diff` blocks for changes to existing shapes; show the full block when most of it is new. Name and order the views to tell the story — skip any that didn't change:

- DB schema (server/src/db/schema.ts) and API route request/response contracts
- key types in common/ (codec, shared API types)
- pseudocode for changed business logic
- a shallow file tree with changed responsibilities
- React component tree, including important hooks, Jotai atoms and data sources (API query vs SSE)
- call tree or data flow (event observer -> DB -> streamer -> client)}

Closes #{N}
