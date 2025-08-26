SECURITY, PRIVACY & LEGAL NOTES
===============================

This app handles audio and camera input; follow these rules to reduce risk and respect privacy and copyright.

Uploaded voice clips (user supportive audio)
-------------------------------------------
- Require explicit consent: present a checkbox confirming the uploader has permission to use the voice recording.
- Limit clip length (recommend <= 10 seconds) and file size (recommend <= 5 MB).
- Store uploaded clips only if necessary for session; offer a "delete" action and document retention time.
- Do NOT perform voice-cloning or impersonation without explicit signed consent from the person whose voice will be synthesized.

Copyrighted content & podcasts/TED talks
----------------------------------------
- DO NOT fetch and play copyrighted podcasts or TED talks unless you have explicit distribution rights.
- Safe alternative: generate short motivational snippets using ElevenLabs TTS or display a link to external copyrighted content (users can open it themselves).
- Avoid claiming the voice is a public figure; build original personas instead.

API keys & secrets
------------------
- Store secrets server-side only (backend .env). Never commit keys to git.
- In the frontend, only expose public client IDs if required (e.g., for Spotify OAuth client_id). Use the backend as a proxy to perform confidential operations.

User data & images
------------------
- Prefer storing derived metrics (angles, rep counts) rather than raw frames.
- If you must store raw frames, obtain consent and secure storage (encrypted at rest). Provide deletion options.
- Log access to stored audio/images and avoid long-term retention for demo submissions.

Accessibility & disclaimers
---------------------------
- Include a visible disclaimer: "Informational only — not medical or professional advice."
- Provide captioning (transcripts) for TTS output for accessibility and for judges running the app silently.

Security checklist (before deployment)
--------------------------------------
- .env added to .gitignore and no keys committed
- Server-side validation on uploaded files (type, length, size)
- HTTPS used on deployed URL (Vercel / Netlify already provide HTTPS)
- Minimal permissions requested in UI and clear prompts for camera/mic
