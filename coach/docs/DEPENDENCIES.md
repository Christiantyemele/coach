DEPENDENCIES & QUICK INSTALL
============================

This document lists recommended packages and commands for a fast MVP build. Use the exact packages listed for quick setup; versions are suggestions and can be updated as needed.

Frontend (React + Vite + TypeScript)
-----------------------------------
Recommended packages:
- react (18+)
- react-dom (18+)
- typescript
- vite
- @tensorflow/tfjs (or @tensorflow/tfjs-core + @tensorflow-models/pose-detection)
- @tensorflow-models/pose-detection (MoveNet)
- @tensorflow/tfjs-backend-webgl
- axios (for HTTP calls)
- howler or native Audio for playback
- concurrently (optional, for running dev servers)

Quick setup (example):
1. npm init vite@latest frontend -- --template react-ts
2. cd frontend
3. npm install @tensorflow/tfjs @tensorflow-models/pose-detection axios howler

Backend (Node + Express)
------------------------
Recommended packages:
- express
- cors
- body-parser (or express.json())
- node-fetch or axios
- dotenv
- lowdb (lightweight JSON DB) or sqlite3 (optional)
- ngrok (dev-time only) to expose local endpoints

Quick setup (example):
1. mkdir backend && cd backend
2. npm init -y
3. npm install express cors axios dotenv lowdb

Dev helper tools
----------------
- ngrok (to expose local backend to ElevenLabs Agents during development)
- Postman or HTTP client for testing endpoints

Notes
-----
- For TTS and conversational streaming, use ElevenLabs SDK or WebSocket/HTTP streaming per ElevenLabs docs.
- If you plan to use Spotify integration, you'll need the Spotify Web Playback SDK and server-side OAuth handlers (express + passport/spotify or custom).
- Keep dependencies minimal to reduce integration time during the 24h sprint.
