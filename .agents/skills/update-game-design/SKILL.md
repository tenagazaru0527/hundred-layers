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

Before expanding, state the reason and the additional files or sections to inspect. When `DOC_MAP.md` cannot route the theme, inspect only the minimum additional range needed to locate the relevant sections. Do not read all of `docs/` or `docs/minutes/` by default. Read minutes only when design history is necessary.

## Feeding the result back into DOC_MAP

Apply this only when routing actually failed or was unclear. Do not change `DOC_MAP.md` on every design-document update.

1. If an existing theme already routes to the sections you needed, leave `DOC_MAP.md` unchanged.
2. If the sections are reachable as a sub-concept of an existing theme, extend that row's theme name or references in the same change.
3. If the additional inspection shows an independent theme that will be referenced repeatedly, add a new row in the same change.
4. If it is only a temporary sub-item or an Issue-specific detail, keep it inside an existing theme instead of adding a row.
5. Do not copy specification text, formulas, probabilities, prices, or decision rationale into `DOC_MAP.md`. Each cell states only where to read.
6. For a theme whose only current source is `OPEN_QUESTIONS.md`, route to `OPEN_QUESTIONS.md` and do not imply that a formal specification exists in `GAME_DESIGN.md`.
7. Reference only section titles that exist in the current `main`.

## Report after updating

Report:

- classified theme or themes;
- initially selected SSOT and related documents;
- documents and sections actually inspected;
- changed files;
- reason for any scope expansion;
- whether `DOC_MAP.md` was updated or judged unnecessary, with a short reason;
- newly established `正式採用`, `Prototype仮採用`, and `未決` items, or state that none changed.
