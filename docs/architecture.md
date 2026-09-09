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

The Python service will use LangGraph to coordinate evidence preparation, deterministic score calculation, and optional model-assisted explanations. Its responsibility is not to replace the API as a system of record. A language model can classify or summarize validated evidence, but the route safety score must be produced by a versioned scoring policy from structured inputs.

### External providers

The maps provider will return geocoding, route alternatives, and route geometry. Firebase Cloud Messaging will deliver push notifications. Twilio or the device dialler may support emergency communication after user consent and regional requirements are established. Integrations must be wrapped behind API-side interfaces so a provider can be changed without impacting the mobile UI.

## Route-safety decision flow

1. The user provides a source and destination in the mobile app.
2. The API requests route alternatives from the selected maps provider.
3. The API gathers validated, time-bounded safety evidence relevant to each route.
4. The AI service applies the controlled scoring policy and returns a score, evidence factors, and confidence information.
5. The API returns the safest and fastest routes, with plain-language explanations and evidence provenance.

The system must never state that a route is safe. It should communicate relative, evidence-based risk information and uncertainty.

## Security and privacy boundaries

- Client-side configuration may contain only values intended for public mobile use; all privileged secrets remain server-side.
- The API validates provider responses, rate-limits sensitive endpoints, and authorizes every access to contacts, reports, SOS incidents, and shared locations.
- Emergency contacts and location sharing require explicit user action and revocable consent.
- Notification and communication providers receive only the data necessary for a specific delivery action.
- Logs must avoid raw secrets and minimize precise location data.

