# Enhancements and Recommendations

This document reviews the current project (frontend and backend) and proposes pragmatic improvements across UX, performance, reliability, security, and DevOps.

Code references use inline paths like `coach/frontend/src/components/CameraFeed.tsx`.

---

## Summary of Key Wins So Far
- Mobile-first responsive layout implemented in `coach/frontend/src/styles.css` with orientation-aware tweaks and safer viewport handling.
- Clear separation of concerns across components: `CameraFeed`, `ChatPanel`, `PlanGenerator`.
- Backend provides a compact API surface for MVP with mocked fallbacks for external providers.
- Exercise rule specs served from `backend/exercise_rules/` and validated via `/api/validate-rep`.

---

## Frontend Enhancements

### 1) UX and Interaction
- [ ] Bold, persistent action bar on mobile for camera and mic: quick Start/Stop and persona toggle.
    - Where: New component `BottomActions.tsx`, rendered in `App.tsx` for <768px widths.
- [ ] Collapsible or tabbed right pane (Plan | Chat) on phones.
    - Where: `App.tsx` conditional UI + small tab component; retain full side-by-side for ≥1024px.
- [ ] Toasts/snackbars for backend errors and network status.
    - Where: Simple context + `useToasts()` hook, or lightweight library-free component.

### 2) Accessibility (A11y)
- [ ] Add ARIA roles/labels to interactive elements in `ChatPanel.tsx` and `PlanGenerator.tsx`.
- [ ] Ensure focus states are visible; provide skip-to-content.
- [ ] Keyboard handling for chat send (Enter) and shift+Enter for newline.
- [ ] Announce speech recognition state changes via `aria-live` polite/assertive.

### 3) Responsiveness and Layout
- [x] Mobile-first CSS, orientation queries, `100dvh`, and `viewport-fit=cover` applied (`index.html`, `styles.css`).
- [ ] Use CSS `clamp()` for type scale to improve readability across devices.
- [ ] Consider container queries for future-proof layouts if browser targets allow.

### 4) Performance
- [ ] Defer heavier work in `CameraFeed.tsx` until user taps Start (lazy-initialize detector and streams).
- [ ] Use `useMemo`/`useCallback` where appropriate to prevent re-renders.
- [ ] Throttle expensive loops and ensure `requestAnimationFrame` lifecycles are cleaned up.
- [ ] Code-split components not needed on first paint (e.g., `PlanGenerator`).

### 5) Robust Media Handling
- [ ] Add explicit permissions UX and graceful fallbacks if `getUserMedia` fails (dialogs, guidance links).
- [ ] Improve camera constraints selection: allow switching cameras (front/back) and resolutions.
- [ ] Provide a manual Retry button for media and STT flows.

### 6) State and Data Flow
- [ ] Introduce lightweight store for app-wide state (e.g., persona, recording status, plan data).
    - Options: React Context + reducer, Zustand, or Redux Toolkit (if growth expected).
- [ ] Persist selected persona and last plan settings in `localStorage`.

### 7) Error Handling and Observability
- [ ] Central error boundary in `App.tsx` to catch render errors.
- [ ] Add structured console logging wrappers to standardize debug output.
- [ ] Optional: integrate client logging to backend `/api/logs` or a SaaS (Sentry) for production.

### 8) Testing
- [ ] Unit tests for utility functions (e.g., `utils/ruleValidator.ts` if exposed client-side).
- [ ] Component tests for `ChatPanel` (mock STT + send), `PlanGenerator` (form, API mock).
- [ ] E2E smoke tests (Playwright) for basic flows: open app, send text, generate plan.

---

## Backend Enhancements (`coach/backend/index.js`)

### 1) API Design & Validation
- [ ] Add request validation (e.g., `zod` or `joi`) for all POST bodies:
    - `/api/adjust-plan`, `/api/generate-plan`, `/api/validate-rep`, `/api/log-workout`, `/api/message`.
- [ ] Consistent error response shape: `{ ok: false, error: { code, message, details? } }`.
- [ ] Add OpenAPI spec (YAML) and serve Swagger UI in dev for quick iteration.

### 2) Security
- [ ] Rate limiting and basic auth (or API keys) for sensitive endpoints like `/api/voice`, `/api/tts`.
- [ ] CORS hardening: restrict origins via env in production.
- [ ] Input sanitization and size limits for uploads (`multer` limits, max JSON body size).
- [ ] Avoid logging PII or raw media buffers; scrub logs.

### 3) Secrets & Config
- [ ] Centralize configuration: `config.js` module reading from env with defaults and validation.
- [ ] Support per-env `.env` files and a `.env.schema` to document required keys.

### 4) External Providers (STT/TTS/LLM)
- [ ] Wrap external calls behind provider interfaces with retry/backoff and timeouts.
- [ ] Capture provider response metadata (latency, error type) for observability.
- [ ] Store minimal request IDs (not payloads) for debugging.
- [ ] Pre-validate AI JSON (plan) with a schema before returning to clients.

### 5) Data Persistence
- [ ] Replace in-memory `workoutHistory` with a durable store:
    - SQLite (dev) → Postgres (prod) via Prisma/Knex.
    - Tables: `users`, `workouts`, `plans`, `messages`, `metrics`.
- [ ] Add `/api/history` and `/api/plans/:id` endpoints.

### 6) Rules Engine & Analysis
- [ ] Move rule evaluation to a dedicated service layer with test coverage.
- [ ] Versioned rule specs in `exercise_rules/` (e.g., `back_squat@v1.json`).
- [ ] Add server-side smoothing/aggregation for pose metrics if the client streams raw keypoints.
- [ ] Consider WebSocket or SSE for streaming analysis feedback.

### 7) Observability & Ops
- [ ] Structured logging (pino/winston) with request IDs.
- [ ] Health and readiness probes; expose `/metrics` (Prometheus) for latency and error rates.
- [ ] Add graceful shutdown hooks (close server, drains in-flight requests).

### 8) Testing
- [ ] Unit tests for endpoints with supertest.
- [ ] Contract tests against mocked providers (OpenAI/Anthropic/ElevenLabs).
- [ ] Load test `/api/voice` and `/api/generate-plan` to size instance resources.

---

## DevOps & Delivery
- [ ] Dockerize frontend and backend with multi-stage builds, small images.
- [ ] Use a single `docker-compose.yml` for local dev, with networked services.
- [ ] GitHub Actions: lint, test, type-check, build, and push images on main.
- [ ] Automated preview deployments (e.g., Vercel/Netlify for FE, Fly.io/Render for BE).
- [ ] Environment-specific configs and secrets management (GitHub OIDC → cloud secret store).

---

## Documentation
- [ ] Update `coach/docs/ARCHITECTURE.md` with data flow diagrams (frontend → backend → providers).
- [ ] Add API reference (paths, request bodies, responses, error codes) and example curl snippets.
- [ ] Add a quickstart section in `README` at repo root (install, run, env setup).

---

## Suggested Roadmap

### Milestone 1: Foundation Hardening (1–2 weeks)
- A11y improvements, toasts, mobile action bar, persona persistence.
- Backend validation, rate limiting, config centralization, logging.
- Basic tests (FE components, BE endpoints), CI checks.

### Milestone 2: Data & Providers (2–3 weeks)
- Move to persistent DB for workouts/plans.
- Implement robust provider interfaces (STT/TTS/LLM) with retries/timeouts and JSON schema validation.
- Add OpenAPI and Swagger docs; containerize and deploy staging.

### Milestone 3: Real-time Coaching (2–3 weeks)
- WebSocket/SSE channel for live analysis and coaching prompts.
- Expand rule engine and add more exercise JSON specs with versions.
- E2E tests, performance tuning for camera/detector.

---

## Concrete Code Pointers
- Frontend
    - `coach/frontend/src/App.tsx`: Add tabbed pane and action bar.
    - `coach/frontend/src/components/ChatPanel.tsx`: A11y labels, keyboard shortcuts, retry UI.
    - `coach/frontend/src/components/PlanGenerator.tsx`: Input validation and error toasts.
    - `coach/frontend/src/styles.css`: `clamp()` typography, container queries (optional).
- Backend
    - `coach/backend/index.js`: Extract routes to modules, add validation middleware, structured logs, rate limiting.
    - `coach/backend/exercise_rules/`: Introduce versions and tests for schema.

---

## Risks and Considerations
- Browser media and autoplay policies vary; continue to provide manual Start and explicit audio elements.
- STT/TTS latency may affect UX; pre-warm models or cache where permissible.
- Ensure any analytics or logs respect privacy requirements noted in `coach/docs/SECURITY_AND_LEGAL.md`.

---

## Done Items (in this iteration)
- Implemented mobile-first responsive layout and rotation handling.
    - Files: `coach/frontend/src/styles.css`, `coach/frontend/index.html`.
