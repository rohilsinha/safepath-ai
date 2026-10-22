# SafePath API: community reports

The community-report feature extends the existing `SafetyReport` model.
Deploy the additive migration with the API's configured PostgreSQL connection:

```powershell
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm typecheck
pnpm build
```

All report endpoints require the existing JWT bearer token:

- `POST /safety-reports` submits a report. Latitude/longitude are validated,
  the incident time must be within the last year and not in the future, and
  the server immediately sets `ACCEPTED`. The client must submit coordinates
  selected for the place or incident being reviewed; the API persists those
  coordinates in the existing `SafetyReport.latitude` and
  `SafetyReport.longitude` fields. Acceptance makes it available as community
  information; it does not mean verified.
- `GET /safety-reports` lists accepted (and legacy approved) reports only.
  Required query parameters:
  `minLatitude`, `maxLatitude`, `minLongitude`, and `maxLongitude`. Optional
  parameters: `occurredAfter`, `occurredBefore`, `limit` (1-100), and `offset`
  (0-10000). Geographic bounds may span at most two degrees on each axis.
- `GET /safety-reports/mine` lists the authenticated user's active reports.
- `GET /safety-reports/:id` returns an accepted/legacy-approved report or the
  authenticated reporter's own report.
- `DELETE /safety-reports/:id` soft-deletes only a report owned by the
  authenticated user. Nonexistent and other users' reports return the same
  404 response to avoid revealing report existence.

Responses never include reporter IDs, email addresses, or review notes.
Duplicate requests from the same reporter with the same category, description,
nearby coordinates, and incident time return the existing report; similar
reports by other reporters are not automatically rejected.

Reports are immediately available in geographic listings and route evidence
after valid submission. Users can find and delete their own reports from My
Reports. Deletion uses `deletedAt` to retain the row while excluding it from
listings, owner lists, duplicate checks, and route matching.

Each submitted report's text is analyzed by the existing local Python service.
The analysis is stored in the separate `ReviewAnalysis` table, linked to
`SafetyReport`, and keyed by a SHA-256 hash of the submitted text and analyzer
name/version. The API calls `SAFETY_ANALYSIS_URL`, defaulting to
`http://127.0.0.1:8001/analyze-review`. Completed results are reused for the
same text and version. Failed attempts are retried after a 30-second backoff
when an identical submission is retried, and a new text or analyzer version
creates a separate history row. Stale pending work can be reclaimed after 60
seconds. Analysis errors do not fail or remove the original report. No
report-text edit endpoint currently exists; any future edit flow must invoke
the same analysis service.

The current `safepath-lexical` analyzer is a small, deterministic keyword
heuristic. Its polarity score is `(positive matches - negative matches) /
total sentiment matches` (-1 negative to +1 positive; 0 neutral; no matches
produces `UNCERTAIN` with score 0). Confidence values are heuristic and not
calibrated probabilities. Analysis is contextual only: sentiment, relevance,
confidence, report count, and self-reported severity do not generate or modify
route risk values.
Community reports remain separate from synthetic demo indicators.

Accepted, recent reports are queried inside a route bounding box, then measured
against the route's actual Mapbox line segments. Default matching is within
100 metres and the preceding 30 days (excluding future-dated reports), configurable in the API environment as
`COMMUNITY_REPORT_PROXIMITY_METERS` (1-1000) and
`COMMUNITY_REPORT_RECENCY_DAYS` (1-365). Duplicate-like reports close in
location/time/category are de-duplicated in a route response. An accepted
report remains an unverified user claim and does not generate a numeric safety
score or risk label.
