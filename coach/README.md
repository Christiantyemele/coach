AI Sports Coach — Web-first MVP (ElevenLabs Agents)
==================================================

Project goal
------------
Build a web-first prototype of "AI Sports Coach" (Feature A) for the Hack-Nation.ai challenge: a voice-first conversational coach that provides real-time feedback on squat form using the browser camera, adapts training plans conversationally, supports persona switching, motivational snippets, music playback, and short uploaded supportive clips.

MVP assumptions & constraints
-----------------------------
- Web-first (React + TypeScript + Vite). No React Native.
- ElevenLabs Agents for conversational voice & TTS; "Loveable" API key available for auxiliary features if needed.
- Pose detection in-browser using TensorFlow.js MoveNet (or MediaPipe).
- Minimal backend (Node/Express) for tool endpoints (analyze, stats, log, adjust).
- No copyrighted podcast/TED audio used without license; user-uploaded clips only with explicit consent.

What is included in this repo
-----------------------------
- README.md (this file)
- .env.example (template for environment keys)
- /docs
  - IMPLEMENTATION_PLAN.md — 24-hour timeboxed plan (user stories, acceptance criteria)
  - ARCHITECTURE.md — high-level architecture and endpoints
  - DEPENDENCIES.md — packages and quick install
  - DEMO_SCRIPT.md — demo flow and fallback plan
  - SECURITY_AND_LEGAL.md — consent, storage, copyright notes

Quickstart (dev)
----------------
1. Copy environment file:
   cp .env.example .env

2. Fill in keys in .env:
   - ELEVENLABS_API_KEY (required)
   - LOVEABLE_API_KEY (optional)
   - BACKEND_URL (if backend deployed or ngrok endpoint)

3. Start frontend:
   - cd frontend
   - npm install
   - npm run dev

4. Start backend (optional local tool endpoints):
   - cd backend
   - npm install
   - npm run dev

5. If ElevenLabs Agents need to call local tool endpoints, expose backend with ngrok:
   - ngrok http 3000
   - set BACKEND_URL in .env to the forwarding URL

Primary deliverables for submission
-----------------------------------
- Deployed demo URL (Vercel / Netlify)
- GitHub repo (this repo)
- 2-minute demo video (happy path + fallback)
- Short architecture README and API endpoint docs (under /docs)
- Known limitations and next steps (in /docs)

Where to go next
----------------
Open /docs/IMPLEMENTATION_PLAN.md for the 24-hour tasks and start with the front-end skeleton and ElevenLabs quickstart integration. If you want, I can now generate the starter frontend and backend skeletons (Vite + React + Express) and the MoveNet camera React component.

Contact & notes
---------------
- Do not commit real API keys to git. Use .env and .gitignore.
- Keep audio clips short (<10s) and confirm consent for any uploaded voice.
