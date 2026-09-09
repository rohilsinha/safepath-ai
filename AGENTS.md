# SafePath AI Development Rules

## Purpose

SafePath AI is an AI-powered safe navigation and emergency response platform primarily designed for women's safety. Its safety-critical flows must be designed conservatively, be clear about their limits, and never imply emergency-service availability unless it is actually integrated and verified.

## Repository boundaries

- `apps/mobile` contains the Expo React Native application.
- `apps/api` contains the NestJS REST API and Prisma database access.
- `services/ai` contains Python, LangGraph, and model-integration code.
- `docs` contains architecture, decisions, plans, and operating guidance.
- Keep mobile, API, and AI concerns separate. Do not add cross-service imports or duplicate business logic across boundaries.

## Development workflow

Before implementing a feature:

1. Inspect the existing code and relevant documentation.
2. Identify the affected files and external dependencies.
3. Explain the implementation plan when the change is architectural or safety-critical.
4. Implement the smallest complete change that meets the requirement.
5. Run relevant type checks, tests, linting, or builds.
6. Report the change, verification results, and remaining limitations.

## Engineering rules

- Do not modify unrelated files.
- Do not introduce dependencies without a clear implementation need.
- Prefer explicit, typed interfaces at module and service boundaries.
- Validate all external API responses and incoming API data.
- Use environment variables for configuration and secrets. Never commit credentials, private keys, tokens, or real API keys.
- Use reusable components and services rather than duplicating behavior.
- Add tests for important backend, scoring, and emergency-workflow logic.
- Preserve user privacy: collect the minimum location and personal data required, protect it in transit and at rest, and make retention rules explicit before storing sensitive data.

## Safety scoring and AI

- A route safety score must come from structured, traceable evidence and a controlled scoring model.
- An LLM must not invent, override, or present an unsupported safety score.
- AI outputs must distinguish supplied facts, calculated results, recommendations, and uncertainty.
- Treat crime, news, reviews, and community reports as potentially incomplete or biased inputs. Record source, time, and confidence when these integrations are introduced.

## Scope control

- Build only what the current task requests.
- Do not create fake integrations, placeholder credentials, or simulated emergency delivery that could be mistaken for a real safety feature.
- For maps, notifications, SMS, voice, or emergency escalation, state prerequisites and testable limitations before claiming the feature works.

