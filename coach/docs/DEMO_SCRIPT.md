DEMO SCRIPT — 2 MINUTE LIVE DEMO + FALLBACK
==========================================

Objective
---------
Show a reliable, repeatable flow demonstrating the core judged features:
- Voice conversation with ElevenLabs agent
- Camera-based squat detection and real-time corrective feedback
- Persona switching, motivational snippets, and music ducking
- Logging and simple plan adjustment

Demo timeline (approx 2 minutes)
-------------------------------
0:00 — 0:10 (Intro slide)
- One-sentence problem + solution (access to coached feedback via AI coach)

0:10 — 0:20 (Architecture slide)
- Very brief architecture: Frontend (browser) -> ElevenLabs agent -> backend tools

0:20 — 0:50 (Live: Start session)
- Show UI: persona dropdown (select "Encouraging")
- Press "Start Session" (microphone & camera prompt)
- Say: "Start set 1" — app acknowledges ("Got it, starting set 1") and begins rep capture

0:50 — 1:20 (Live: Reps & feedback)
- Perform 3 squats in view of camera
- App shows rep counter and after each rep plays a short motivational TTS snippet
- After a rep with simulated poor form, app says corrective line: "Good depth, tighten your core — keep chest up."

1:20 — 1:40 (Live: Adjust plan)
- Say: "I'm fatigued today" -> agent calls get_stats/adjust_plan and responds with adjusted plan: "We'll reduce reps this session, keep same load."

1:40 — 1:50 (Show uploads & music)
- Quickly show the music control and uploaded "supportive clip" list and play a clip (preview)

1:50 — 2:00 (Closing)
- Summarize next steps and where judges can find the demo and repo

Fallback plan (if streaming / ElevenLabs or network fails)
----------------------------------------------------------
- If ElevenLabs streaming fails, switch to text-mode: type a sample user message and show the agent's text reply.
- If camera isn't working, show a recorded short video / GIF of rep detection and the resulting agent replies.
- Always have the 2-minute recorded demo video ready to play if live demo fails.

Notes for recording the demo video
---------------------------------
- Keep the camera framing consistent and well-lit
- If possible, use a laptop camera with good lighting
- Capture the browser window and speak clearly (or include subtitles)
