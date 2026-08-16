---
name: update-game-design
description: Route and update this repository's game-design documents with minimal context. Use for adding game-design ideas, changing existing specifications, synchronizing design documents with the Prototype, or recording unresolved design questions.
---

# Update Game Design

## Workflow

1. Read `docs/DOC_MAP.md` first.
2. Classify the requested change into one or more themes from the map.
3. List the SSOT, related documents, and sections selected before editing.
4. Read the selected SSOT sections first.
5. Read only the mapped related sections needed to check consistency.
6. Preserve the existing status of each statement: `正式採用`, `Prototype仮採用`, or `未決`.
7. Do not promote unresolved matters to formal specifications without an explicit decision.
8. Update only the files required by the change.
9. Check consistency within the inspected scope and review the diff.

Do not copy game rules, formulas, probabilities, calendar names, enemy values, prices, party sizes, or other specification text into this skill. Read current values from the mapped SSOT.

## Expanding the inspection scope

Expand beyond the mapped sections only when the change crosses multiple systems, changes `docs/GAME_CONCEPT.md`, changes the SSOT structure, reveals a contradiction, cannot be routed by `DOC_MAP.md`, or the user requests a full consistency review.

Before expanding, state the reason and the additional files or sections to inspect. Do not read all of `docs/` or `docs/minutes/` by default. Read minutes only when design history is necessary.

## Report after updating

Report:

- classified theme or themes;
- initially selected SSOT and related documents;
- documents and sections actually inspected;
- changed files;
- reason for any scope expansion;
- newly established `正式採用`, `Prototype仮採用`, and `未決` items, or state that none changed.
