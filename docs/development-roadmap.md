# SafePath AI Development Roadmap

## Guiding approach

Each phase should produce a small, verifiable increment. Safety-critical claims and integrations require explicit limitations, testing, and operational review before they are presented as available to users.

## Phase 0: Repository foundation

- Create the repository layout, project rules, architecture documentation, roadmap, and ignore rules.
- Define component boundaries and safety-scoring principles.
- Status: complete with this initial setup.

## Phase 1: API and data foundation

- Create the NestJS application in `apps/api`.
- Configure PostgreSQL and Prisma with migrations.
- Establish authentication and authorization design.
- Add health checks, configuration validation, error handling, and baseline tests.
- Define initial entities for users and emergency contacts without collecting unnecessary sensitive data.

## Phase 2: Mobile application foundation

- Create the Expo and TypeScript application in `apps/mobile`.
- Configure Expo Router and a minimal authenticated navigation structure.
- Add typed API-client infrastructure and secure client configuration.
- Add test and type-check tooling.

## Phase 3: Maps and route alternatives

- Select and configure Google Maps or Mapbox.
- Implement source/destination search and route-alternative retrieval through the API.
- Display route duration, distance, and map geometry.
- Validate provider responses and handle unavailable routing gracefully.

## Phase 4: Safety evidence and scoring

- Define a versioned, deterministic route-safety scoring policy.
- Add validated data-source adapters for crime history, news, and community reports.
- Build the Python and LangGraph service in `services/ai`.
- Return score factors, source times, confidence, and uncertainty alongside each score.
- Add unit and integration tests for scoring logic.

## Phase 5: Community safety reports

- Add authenticated safety-report creation and moderation policy.
- Support report categorization, geographic precision controls, timestamps, and privacy protections.
- Surface only appropriately reviewed or confidence-weighted reports in route evidence.

## Phase 6: Emergency contacts and SOS

- Implement emergency-contact management.
- Build a deliberate SOS state machine with confirmation, cancellation, audit events, and failure handling.
- Add consent-based, time-limited location-sharing sessions.
- Test authorization, location access, and incident lifecycle behavior thoroughly.

## Phase 7: Notifications and emergency communication

- Integrate Firebase Cloud Messaging for device notifications.
- Evaluate and integrate Twilio SMS or Voice and device dialling where appropriate.
- Add delivery tracking, retry policy, user-visible status, and clear fallback behavior.
- Confirm regional compliance, consent, cost controls, and emergency-service limitations before release.

## Phase 8: Quality, security, and release readiness

- Complete end-to-end, accessibility, privacy, load, and security testing.
- Establish observability, incident response, retention, and deletion procedures.
- Conduct safety review of route-scoring language and SOS failure modes.
- Prepare deployment environments and a staged release plan.

