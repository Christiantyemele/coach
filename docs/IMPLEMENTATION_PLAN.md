IMPLEMENTATION PLAN — 24 HOUR SPRINT
===================================

Overview
--------
This file provides the exact timeboxed plan, broken into user stories and tasks, with owners (assume solo dev) and acceptance criteria so the team can deliver a reliable MVP in 24 hours.

Core MVP (must complete)
- Voice conversational flow (ElevenLabs Agents) with text fallback
- Camera-based squat detection (MoveNet or MediaPipe in browser)
- Agent tool-calls: analyze_form, get_stats, log_workout, adjust_plan
- Persona switching and motivational snippets (TTS)
- Music playback (royalty-free) with ducking during TTS
- Upload short supportive audio clips and map to triggers
- Minimal backend endpoints to support tool-calls (Node/Express)

Schedule (hour-based blocks)
----------------------------
Hour 0 — Planning & setup (0.5 h)
- Create repo, add README, .env.example, docs folder
- Initialize frontend (Vite + React + TS)
- Initialize backend (Express)

Hour 0.5–3 — ElevenLabs quickstart + basic Chat UI (2.5 h)
- Integrate microphone capture; show captured transcript
- Provide text fallback replies if streaming unavailable
Acceptance:
- Start/stop voice capture works; transcript visible; agent text reply visible

Hour 3–6 — Camera feed + MoveNet pose detection + rep detection (3 h)
- Add camera component (getUserMedia)
- Integrate MoveNet (TF.js)
- Implement rep counter, smoothing, and simple angle metrics
Acceptance:
- Pose keypoints visible; reps count reliably for test subject (3 reps)

Hour 6–7 — Local analyzeForm & UI integration (1 h)
- Implement analysis function mapping keypoints -> issues list
- Allow chat to request analysis
Acceptance:
- "Analyze" returns issues like "insufficient depth", "leaning forward"

Hour 7–9 — Backend endpoints + tool-call wiring (2 h)
- Implement endpoints: /api/analyze, /api/stats, /api/log-workout, /api/adjust-plan
- Expose via ngrok or deploy
Acceptance:
- Endpoints return defined schemas

Hour 9–11 — Agent persona & tool-calling (2 h)
- Persona prompts for "Encouraging" and "Tough"
- Agent calls analyze endpoint when asked
Acceptance:
- Agent uses selected persona; analyze tool-call functional

Hour 11–13 — Motivational snippets + music + ducking (2 h)
- Add royalty-free tracks
- Play/pause UI, volume ducking when TTS plays
- Play motivational TTS between reps
Acceptance:
- Music plays; volume lowers during TTS; snippets fire after rep

Hour 13–15 — Voice upload + playback mapping (2 h)
- Upload form, size & length validation, list uploaded clips
- Assign clip to triggers and play
Acceptance:
- Upload and preview works; assigned clip plays at trigger

Hour 15–17 — Training plan & growth heuristic (2 h)
- Log workouts in JSON; adjust plan with heuristic
Acceptance:
- adjust-plan returns new plan after history input

Hour 17–19 — Robustness & edge cases (2 h)
- Pose confidence fallbacks, network failure fallbacks, loop protection
Acceptance:
- Low confidence -> "Please move closer"; server guards duplicate calls

Hour 19–21 — UI polish & captions (2 h)
- Captions for TTS; mobile responsiveness; permission hints
Acceptance:
- Captions appear and UI usable on phone browser

Hour 21–22 — E2E testing & mobile smoke test (1 h)
- Test in laptop and phone; confirm permission flows
Acceptance:
- Happy path works end-to-end

Hour 22–23 — Deploy & record demo (1 h)
- Deploy frontend (Vercel), backend (Render/Heroku) or use ngrok
- Record 2m demo video
Acceptance:
- Deployed URL reachable; demo video saved

Hour 23–24 — Final docs & submission package (1 h)
- Finalize README, docs, demo links, known limits
Acceptance:
- Repo and assets ready for submission

User Stories (condensed)
------------------------
US-01: Start voice session and talk to AI coach
US-02: Squat rep counting and simple form detection
US-03: Request form analysis and receive actionable feedback
US-04: Switch coach persona (style & TTS voice)
US-05: Hear motivational snippets between reps
US-06: Music playback with ducking during TTS
US-07: Upload supportive voice clip and map to trigger
US-08: Log workouts and suggest simple plan adjustments

Acceptance criteria summary
--------------------------
- End-to-end voice -> tool-call -> analysis -> TTS flow is demonstrable
- Pose detection and rep counting reliable for short demo
- Persona switching changes voice/tone and short phrasing
- Safety: no copyrighted/podcast audio played without rights; user uploads require consent

Quick run checklist before demo
-------------------------------
- Fill .env with keys (ELEVENLABS_API_KEY, LOVEABLE_API_KEY optional)
- Start frontend and backend
- Verify permissions for microphone & camera
- Run a 3-rep squat test and ensure agent replies
- Record the demo video (happy path + camera fallback)
