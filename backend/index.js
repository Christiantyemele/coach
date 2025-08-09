/**
 * Backend tool endpoints for AI Sports Coach (minimal)
 *
 * Endpoints:
 * - GET  /api/health
 * - POST /api/analyze       { keypoints }
 * - GET  /api/stats
 * - POST /api/log-workout
 * - POST /api/adjust-plan
 * - POST /api/voice         (accepts uploaded audio blob, returns { transcript })
 *
 * Use this simple server during development. For production, replace in-memory storage with a DB
 * and implement secure forwarding of audio to ElevenLabs or a trusted STT provider.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
//const resp = require("express/lib/express"); // lightweight multipart parser
const upload = multer();
// Dynamic import for node-fetch (ES module) - will be imported when needed

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// In-memory storage for demo purposes
const workoutHistory = [];

/** Health check */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

/**
 * Analyze pose keypoints
 * - For MVP we accept keypoints payload and return mock analysis.
 * - When integrating MoveNet, send keypoints here (small JSON) and return structured analysis.
 */
app.post("/api/analyze", (req, res) => {
  const { keypoints } = req.body || {};
  // Basic mocked response - replace with real analysis logic
  const analysis = {
    valid: !!keypoints,
    issues: [],
    metrics: {
      torso_angle: 12.3,
      knee_angle: 95.2,
      depth: 0.42
    },
    confidence: 0.85
  };

  // Example heuristic: low depth
  if (!keypoints) {
    analysis.valid = false;
    analysis.issues.push("no_pose_detected");
    analysis.confidence = 0;
  } else if (analysis.metrics.depth < 0.5) {
    analysis.issues.push("insufficient_depth");
  }

  res.json(analysis);
});

/** Return mock user stats (sleep, fatigue, weight, HR) */
app.get("/api/stats", (req, res) => {
  res.json({
    sleep_hours: 6.2,
    fatigue_level: 4,
    weight_kg: 78,
    HR_rest: 62
  });
});

/** Log workout (append to in-memory history) */
app.post("/api/log-workout", (req, res) => {
  const entry = req.body || {};
  entry.logged_at = new Date().toISOString();
  workoutHistory.push(entry);
  res.json({ ok: true, entry });
});

/**
 * Simple adjust-plan heuristic:
 * - If last 3 sessions show reps >= target -> increase load slightly
 * - If fatigue high or sleep low -> decrease intensity
 */
app.post("/api/adjust-plan", (req, res) => {
  const { history = [], stats = {}, user_feedback = "" } = req.body || {};
  // Simple heuristic demonstration
  const plan = {
    new_plan: {
      week: "next",
      exercises: [
        { name: "Back Squat", sets: 3, reps: 8, load_percent: 70 }
      ]
    },
    rationale: ""
  };

  if (stats.sleep_hours && stats.sleep_hours < 6) {
    plan.new_plan.exercises[0].reps = 6;
    plan.rationale = "Reduced reps due to low sleep";
  } else if (history.length >= 3) {
    plan.new_plan.exercises[0].load_percent += 2; // small progression
    plan.rationale = "Progression recommended based on history";
  } else {
    plan.rationale = "Maintain current load; insufficient history for progression";
  }

  if (/fatig/.test(user_feedback)) {
    plan.new_plan.exercises[0].reps = Math.max(5, plan.new_plan.exercises[0].reps - 2);
    plan.rationale += " — user reported fatigue";
  }

  res.json(plan);
});

/**
 * POST /api/message
 * Accepts JSON: { text: string, persona?: string }
 * Logs the incoming message (so you can see it in server console) and returns a mocked reply.
 * In production, this endpoint would forward the text to an agent / ElevenLabs conversational endpoint.
 */
app.post("/api/message", (req, res) => {
  try {
    const { text, persona } = req.body || {};
    console.log("POST /api/message", { text, persona, ts: new Date().toISOString() });

    // Simple persona-aware mocked reply
    let reply;
    if (persona === "tough") {
      reply = `Tough Coach: Focus! ${text.length > 0 ? "Good call — now give me full effort on the next rep." : "Let's go."}`;
    } else {
      reply = `Encouraging Coach: Nice. ${text.length > 0 ? "Keep your chest up and breathe." : "You're doing well."}`;
    }

    return res.json({ reply, source: "mock" });
  } catch (err) {
    console.error("Error in /api/message:", err);
    res.status(500).json({ error: "server_error" });
  }
});

/**
 * POST /api/voice
 * Accepts multipart/form-data with field "file" (audio blob) and optional "persona".
 * Forwards the audio to ElevenLabs speech-to-text endpoint server-side using ELEVENLABS_API_KEY.
 * Returns JSON: { transcript: string }
 *
 * Behavior:
 * - If forwarding to ElevenLabs succeeds and the provider returns transcript, reply with it.
 * - If forwarding fails or ELEVENLABS_API_KEY is missing, fall back to a mocked transcript so dev continues.
 *
 * Notes:
 * - Keep ELEVENLABS_API_KEY in backend .env (do not expose it to the frontend).
 * - The ElevenLabs endpoint used here is the common speech-to-text path; if your ElevenLabs plan uses
 *   a different endpoint or requires additional fields, adapt the URL and request accordingly.
 */

app.post("/api/voice", upload.single("file"), async (req, res) => {
  try {
    const file = req.file; // multer parsed file buffer
    const persona = req.body && req.body.persona;
    if (!file) {
      return res.status(400).json({ error: "no_file" });
    }

    const elevenApiKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenApiKey) {
      // No API key configured — fallback to mocked transcript for dev
      const mockedTranscript = `Mock transcript (persona=${persona || "default"}). Example: "Start set one, three reps."`;
      return res.json({ transcript: mockedTranscript, source: "mock" });
    }

    // Build multipart/form-data to forward the audio buffer
    const FormData = require("form-data");
    const form = new FormData();
    // Attach file buffer, specify filename and contentType
    form.append("file", file.buffer, {
      filename: file.originalname || "recording.webm",
      contentType: file.mimetype || "audio/webm"
    });

    // If ElevenLabs requires additional form fields, add them here (e.g., model selection, language)
    // Add model_id as required by ElevenLabs STT API (use env override or default "general")
    form.append("model_id", process.env.ELEVENLABS_STT_MODEL || "general");

    // ElevenLabs speech-to-text endpoint
    const ELEVEN_URL = "https://api.elevenlabs.io/v1/speech-to-text";

    // Use node-fetch v3 (ES module) with dynamic import to forward the request.
    const { default: fetch } = await import("node-fetch");

    // Prepare headers from form.getHeaders() and set xi-api-key per ElevenLabs docs
    const headers = form.getHeaders();
    headers["xi-api-key"] = elevenApiKey;

    // Forward the multipart/form-data to ElevenLabs STT
    const resp = await fetch(ELEVEN_URL, {
      method: "POST",
      headers,
      body: form
    });

    if (!resp.ok) {
      console.warn("ElevenLabs STT returned non-ok status", resp.status);
      let errText = "";
      try {
        errText = await resp.text();
      } catch {}
      console.warn("ElevenLabs response body:", errText);
      // Fallback: return a mocked transcript so the app keeps working in demo
      const mockedTranscript = `Mock transcript (persona=${persona || "default"}). Example: "Start set one, three reps."`;
      return res.json({ transcript: mockedTranscript, source: "fallback" });
    }

    // Parse ElevenLabs JSON response and extract `text` (per provided schema)
    let json;
    try {
      json = await resp.json();
    } catch (err) {
      console.warn("Failed to parse ElevenLabs response as JSON", err);
      const mockedTranscript = `Mock transcript (persona=${persona || "default"}). Example: "Start set one, three reps."`;
      return res.json({ transcript: mockedTranscript, source: "fallback_parse" });
    }

    // Primary transcript field per ElevenLabs STT: json.text
    let transcript;
    if (typeof json.text === "string" && json.text.trim().length > 0) {
      transcript = json.text;
    } else if (typeof json.transcript === "string" && json.transcript.trim().length > 0) {
      transcript = json.transcript;
    } else if (Array.isArray(json.words) && json.words.length > 0) {
      // fallback: join words array texts
      transcript = json.words.map((w) => w.text).join(" ");
    } else if (Array.isArray(json.data) && json.data[0] && typeof json.data[0].text === "string") {
      transcript = json.data[0].text;
    } else {
      // last resort: stringify for debugging
      transcript = (json && JSON.stringify(json)) || null;
    }

    return res.json({ transcript, source: "elevenlabs" });
  } catch (err) {
    console.error("Voice upload/forward error", err);
    // Final fallback to mocked transcript
    const persona = (req.body && req.body.persona) || "default";
    const mockedTranscript = `Mock transcript (persona=${persona}). Example: "Start set one, three reps."`;
    res.status(200).json({ transcript: mockedTranscript, source: "fallback_exception" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
