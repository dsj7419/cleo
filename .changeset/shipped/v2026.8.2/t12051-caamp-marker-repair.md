---
id: t12051-caamp-marker-repair
tasks: [T12051]
kind: fix
summary: Heal damaged CAAMP markers instead of duplicating instruction blocks, and make `cleo doctor` able to repair what it detects
---

A CAAMP marker that lost a single character was unrecoverable *and*
self-amplifying. `inject()` matched only complete `START…END` pairs, so a
damaged opening marker (`!-- CAAMP:START -->`, the leading `<` gone) was
invisible: the function concluded the file had no CAAMP block and took its
**prepend** branch, adding a block beside the damaged one rather than replacing
it. `cleo doctor` then reported "markers unbalanced" and prescribed
`cleo upgrade`, which re-runs `inject()` — the very thing that created the
duplicate.

Observed on the global hub `~/.agents/AGENTS.md`, which reached thirteen blocks.

Two independent *detect-but-cannot-fix* loops kept it alive across upgrades:
`checkAgentsMdHub` substring-matched `content.includes('CAAMP:START')`, which
the damaged literal also satisfies, so it reported the corrupt file **healthy**;
and no fixer was registered for the marker checks, so `cleo doctor --fix`
skipped them silently.

- The marker grammar is now a single source of truth in
  `@cleocode/contracts/caamp-markers`, replacing five divergent inline copies
  and eight inline copies of the injection-action union.
- `normalizeMarkers` heals near-miss markers before any decision is made about a
  file; `reconcile` replaces the first block in place and drops the rest,
  preserving everything outside the markers.
- Writes are atomic (tmp-then-rename) under a cross-process lock carrying a
  fencing token, so a holder whose guard is reclaimed as stale cannot revoke the
  next holder's. `inject()` fails closed on a torn read rather than replacing a
  file with a lone block.
- New `cleo caamp repair [--dry-run]` covers the project files, the global hub
  and every detected provider file, and merges blocks whose bodies *differ* —
  dedupe-by-identical-content could not fix the "N blocks (expected 1)" state
  the health check reports.
- `cleo doctor` now inspects the global hub at all, detects damaged markers and
  duplicate blocks, and prescribes a repair that works.
- `vitest.setup.ts` pins `AGENTS_HOME` per fork. `injection-chain.test.ts`'s
  hand-rolled `inject` mock — an unconditional prepend with no marker detection —
  had been writing the developer's real `~/.agents/AGENTS.md`; its output
  reproduces the observed 13-block file byte-exactly.

Fixed in passing: `replace(pattern, block)` treated `block` as a replacement
string, so `$&`, `` $` ``, `$'` and `$n` in injected content spliced the old
block — markers included — inside the new one; and `sanitizeCaampFile` deleted
any line that was a capitalised filename (for example a user's `CONTRIBUTING.md`
line) from the global hub on every bootstrap and every npm postinstall.

Also lands the E6 ProjectStore cutover (T11530, T12037–T12039, T12041): every
domain now binds through a path-keyed registry instead of a per-facade singleton
quartet, `cleo doctor fk-check [--fix]` verifies and repairs foreign-key
integrity, and a new architectural gate blocks re-introducing the singleton
pattern.
