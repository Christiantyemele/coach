ARCHITECTURE & COMPONENTS
=========================

High-level components
---------------------
1. Frontend (React + TypeScript)
   - ChatPanel: text + voice capture controls, conversation transcript, persona selector
   - CameraFeed: getUserMedia + MoveNet (TF.js) for pose keypoints
   - MetricsPanel: rep counter, angles, HR simulation, plan summary
   - Audio manager: plays TTS, motivational snippets, music, and uploaded clips; performs music ducking

2. Backend (Node + Express)
   - Tool endpoints consumed by the ElevenLabs agent: /api/analyze, /api/stats, /api/log-workout, /api/adjust-plan
   - Minimal persistence: local JSON or SQLite for logged workouts and plan state

3. ElevenLabs Agents (cloud)
   - Conversational agent (tool-calling enabled)
   - Persona system prompts + mapping to voice IDs
   - Agent calls tool endpoints when appropriate (analyze_form, get_stats, adjust_plan)

4. Optional Third-party services
   - Spotify (optional) for music playback using Web Playback SDK (requires OAuth)
   - Loveable API (aux) mapped to LOVEABLE_API_KEY for additional features if needed

Data flow
---------
- User speaks into the browser -> microphone capture -> ElevenLabs agent (streamed audio)
- Agent processes input, may decide to call tools
  - Example: "Check my squat" -> agent calls POST /api/analyze with pose keypoints (or frame id)
- Backend analyzes keypoints (or uses pre-computed analysis) and returns structured JSON
- Agent receives the tool result and responds; frontend receives agent response and TTS audio, which is played

Endpoints (required)
--------------------
- POST /api/analyze
  - Request: { keypoints: [...], timestamp }
  - Response: { valid: boolean, issues: [string], metrics: { torso_angle, knee_angle, depth }, confidence: number }

- GET /api/stats
  - Response: { sleep_hours, fatigue_level, weight_kg, HR_rest }

- POST /api/log-workout
  - Request: { date, exercise, sets: [{reps, avg_depth, issues}], summary }
  - Response: { ok: true }

- POST /api/adjust-plan
  - Request: { history: [...], stats: {...}, user_feedback: string }
  - Response: { new_plan: {...}, rationale: string }

Agent tool-calling design notes
-------------------------------
- Keep tool-calls idempotent and guarded (server refuses duplicate calls within a short window)
- Tool-call payloads should be small (send keypoints, not raw frames)
- The agent should have fallback text-only behavior if the backend tool-call fails

Performance & latency considerations
------------------------------------
- Run MoveNet in browser (TF.js) to avoid sending raw frames to the server — lower latency
- Use audio streaming for ElevenLabs for low-latency responses; provide short acknowledgment TTS/text while analyzing heavy work
- Use a smoothing window (median or EMA) on keypoint metrics to reduce false positives

Security & privacy
------------------
- Do not store raw video frames persistently by default; only store derived metrics and logs
- Require explicit consent before storing uploaded voice clips; provide delete option
- Keep API keys in server-side env only, never expose secrets in client bundle
