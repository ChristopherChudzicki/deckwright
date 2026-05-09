# Remove legacy JSON import/export

**Date:** 2026-05-09
**Branch:** `worktree-remove-json-import-export`

## Context

The deck list and the deck detail page used to expose two buttons: **Import JSON** (top of `/`) and **Export JSON** (top of `/deck/$id`). The flow ran through `src/decks/io.ts` (`serializeDeck` / `parseDeckJson`) and `src/lib/download.ts` (`downloadText`). Validation happened against `deckSchema` in `src/decks/schema.ts`, which wrapped a discriminated `cardSchema` and a literal `version: 1`.

This was the offline-backup path designed before the app had persistence. The original spec (`2026-04-26-persistence-and-auth-design.md`) explicitly committed to keeping it as a fallback after persistence shipped.

## Why remove it

**No real benefit now.** Persistence + anonymous login already cover the use cases JSON import/export was designed for:

- Anonymous sessions persist decks server-side without an account, so users no longer need a local file as a "save my work" mechanism.
- Signed-in accounts already round-trip cards through Supabase. There's no offline scenario the export was uniquely solving.

**Schema drift is a real footgun.** The export writes whatever shape the in-memory `Deck` type currently has. The import re-parses that shape against `deckSchema`. Every migration that touches a card column has to consciously stay backwards-compatible with every previously-exported JSON file, forever — or import silently breaks (best case) or silently corrupts data (worst case). We are not enforcing that discipline anywhere; nothing in CI checks that an old export still imports cleanly. The longer this feature lives the more landmines accumulate.

The current `version: 1` literal is the only formal hint that the format is versioned, but bumping the version isn't wired up anywhere — there's no migration path between versions, just a rejection. So in practice the schema *is* drifting against the file format and we've been getting away with it because few users have ever round-tripped.

**Label friction.** A secondary concern: "JSON" is developer jargon. The buttons read as opaque to typical users. Renaming wouldn't fix the underlying problems, but it's worth noting the feature wasn't carrying its weight as a UX affordance either.

## What was removed

- `src/decks/io.ts`, `src/decks/io.test.ts` — `serializeDeck`, `parseDeckJson`.
- `src/lib/download.ts` — Blob/anchor download helper, only consumer was `serializeDeck`.
- `deckSchema` and the deck-level `cardSchema` discriminated union from `src/decks/schema.ts` — only used to validate JSON on import.
- The `Import JSON` buttons, file inputs, and `handleImport` from `src/views/HomeView.tsx`.
- The `Export JSON` button and `handleExport` from `src/views/DeckView.tsx`.
- Corresponding tests in `src/decks/schema.test.ts` (deckSchema describe block) and `src/views/HomeView.test.tsx` (the import flow case).

## What was kept

- `itemCardSchema`, `spellCardSchema`, `abilityCardSchema` — still used to validate API-mapped cards in `src/api/mappers/*.test.ts` and factory output in `src/cards/factories.test.ts`.
- `cardPayloadSchema` — consumed by `scripts/gen-card-schema.ts`.
- `.default([])` on `headerTags` / `footerTags` in `baseCardSchema` — originally added to tolerate older JSON imports. Harmless to keep; tightening would be a separate, scoped change.

## Out of scope

- A replacement export/backup feature. If we want one later it should be opaque (a server-issued backup token, or a database-level dump) rather than a client-side serializer that has to track the schema by hand.
- Updating older docs in `docs/superpowers/specs/` and `docs/superpowers/plans/` that still reference the old flow as historical context. They're dated archives.
