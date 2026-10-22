# SafePath AI Planned Architecture

## Overview

SafePath AI will use a three-part architecture so that the mobile experience, operational API, and AI analysis can evolve independently. The repository is currently documentation-only; the components below describe the planned design rather than deployed services.

```text
Expo Mobile App
       |
       | HTTPS REST APIs
       v
NestJS API ---------------------- PostgreSQL via Prisma
       |
       | authenticated internal requests
       v
Python AI Service
       |
       +-- LangGraph workflows
       +-- OpenAI or Gemini integration
       +-- safety-evidence analysis

External integrations through the API boundary:
Maps provider | Firebase Cloud Messaging | Twilio SMS or Voice | Safety-data sources
```

## Components

### Mobile application

The React Native and Expo application will provide authentication, route search, route comparison, safety-report submission, emergency-contact management, SOS activation, and location-sharing controls. Expo Router will organize navigation. The mobile app will communicate only with the API for application data and will not contain privileged provider credentials.

### API application

The NestJS API will be the system of record and integration boundary. It will authenticate requests, enforce authorization, validate inputs, persist application data through Prisma, coordinate provider calls, and expose REST endpoints. The API will keep emergency workflows auditable and will send only the minimum information required to each external provider.

### Database

PostgreSQL will store user-controlled application data such as profiles, emergency contacts, safety reports, route-analysis records, SOS incidents, location-sharing sessions, and notification delivery records. Prisma will provide typed database access and migrations. Data retention, deletion, and access controls must be defined before sensitive location data is stored.

### AI service

The Python service currently exposes the deterministic scorer through a small
loopback-only JSON HTTP service using the Python standard library. Its
responsibility is not to replace the API as a system of record. LangGraph and
model-assisted explanations remain future work; any future model may help
classify or summarize validated evidence, but the route safety score must be
produced by a versioned scoring policy from structured inputs.

### External providers

The maps provider will return geocoding, route alternatives, and route geometry. Firebase Cloud Messaging will deliver push notifications. Twilio or the device dialler may support emergency communication after user consent and regional requirements are established. Integrations must be wrapped behind API-side interfaces so a provider can be changed without impacting the mobile UI.

## Route-safety decision flow

1. The user provides a source and destination in the mobile app.
2. The API requests route alternatives from the selected maps provider.
3. The API requests assessments from the Python scoring service for returned routes.
4. The scoring service applies the deterministic versioned policy to route-specific normalized values. In Stage 1, values come only from matched synthetic demo indicators; community reports remain unverified context and do not create risk values.
5. The API returns each real route with assessment status, score (or null), risk level, coverage, category availability, and separate community and demo evidence.

The system must never state that a route is safe. It should communicate relative, evidence-based risk information and uncertainty.

The intended processing sequence is:

```text
REAL ROUTE DATA
      ↓
SAFETY EVIDENCE
(crime history, incidents/news, community reports, environmental factors,
 crowd/activity)
      ↓
EVIDENCE NORMALIZATION
      ↓
DETERMINISTIC, VERSIONED SAFETY SCORE
      ↓
RISK LEVEL
      ↓
AI-GENERATED EXPLANATION
```

The numerical score and risk level must be calculated deterministically from
validated, traceable evidence and a versioned policy. AI may help analyze, extract,
or summarize evidence and explain a completed assessment, but must not arbitrarily
invent or override the final score. The current API and mobile app carry and display an assessment per route.
Stage 1 uses a fixed, explicitly synthetic demo dataset near Chennai, matched
against actual Mapbox route geometry. A matching route may receive a DEMO-labelled
score and rank; this dataset is not a production evidence source and does not
describe real incidents. Routes outside its limited coverage retain the existing
insufficient-data status and null score. Accepted community reports remain
separate, unverified context and cannot generate a score from counts or
self-reported severity. No production evidence source or evidence-normalization
pipeline is connected. If the Python service is unavailable, the API preserves
route results and returns a null-score `unavailable` assessment.

### Initial deterministic scoring policy

The Python safety service currently provides a standalone scoring function over
validated normalized category risks from 0 to 100. A risk value of 0 represents
no observed risk for that category and 100 the maximum normalized risk. The
initial category weights are:

| Category | Weight |
| --- | ---: |
| Crime history | 0.30 |
| Recent incidents/news | 0.25 |
| Community reports | 0.20 |
| Environmental factors | 0.15 |
| Crowd/activity | 0.10 |

Weights must be non-negative and sum to 1.0. For available categories, the engine
calculates `overallRisk = sum(risk × weight) / sum(available weights)`, then
`safetyScore = clamp(round-half-up(100 - overallRisk), 0, 100)`. Risk levels are
based on the resulting score: 80–100 Low, 60–79 Moderate, 40–59 High, and 0–39
Very High.

Unavailable categories are not treated as zero risk. Available-category weights
are renormalized for the weighted mean; the reported data coverage is the sum of
the original weights for available categories (0.0–1.0), with category
availability and effective weights also returned. Consequently, a score with
partial coverage describes only the observed categories. Missing categories
remain explicit in the assessment and reduce coverage. If no positive-weight
category is available, the engine returns an insufficient-data status, an
insufficient-data risk level, and no numeric score.

Evidence records (source, description, time, severity, confidence, recency, and
geographic relevance) are distinct from normalized category risks. This scoring
function does not extract, ingest, geospatially match, or normalize evidence;
it only computes from already-normalized inputs. Evidence analysis and extraction
may be supported by AI in a future integration, while the numerical score remains
deterministic. The engine is now connected to live route responses and the mobile
UI. Stage 1 scores are demo-only, while real-world assessments remain
insufficient-data until a production evidence source is validated. See [the scoring service setup](../services/ai/README.md)
for Windows environment and run instructions.

## Security and privacy boundaries

- Client-side configuration may contain only values intended for public mobile use; all privileged secrets remain server-side.
- The API validates provider responses, rate-limits sensitive endpoints, and authorizes every access to contacts, reports, SOS incidents, and shared locations.
- Emergency contacts and location sharing require explicit user action and revocable consent.
- Notification and communication providers receive only the data necessary for a specific delivery action.
- Logs must avoid raw secrets and minimize precise location data.
