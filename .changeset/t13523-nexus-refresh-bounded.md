---
id: t13523-nexus-refresh-bounded
tasks: [T13523]
kind: fix
summary: "Read-only nexus impact/context no longer starts an unbounded in-process refresh; --no-refresh and CLEO_NEXUS_AUTO_REFRESH opt out"
---

A graph query auto-refreshes a stale index only when a recorded run cost bounds the refresh. With no cost recorded it answers from the stale index and says why, instead of running a full analysis (Leiden included) that could abort at the CLI heap cap. `cleo nexus impact` and `cleo nexus context` gain `--no-refresh`, and `CLEO_NEXUS_AUTO_REFRESH=false` turns inline refresh off for every graph query.
