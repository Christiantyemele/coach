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
 * Accepts JSON: { text: string, persona?: "encouraging" | "tough" }
 * Now calls Anthropic (if configured) with persona + workout progress JSON to craft the reply.
 * Side effects (log_workout, adjust_plan) are applied before the LLM call so context reflects latest state.
 */
app.post("/api/message", async (req, res) => {
  try {
    const { text = "", persona = "encouraging" } = req.body || {};
    const userText = String(text || "").trim();
    console.log("POST /api/message", { text: userText, persona, ts: new Date().toISOString() });

    const personas = {
      encouraging: {
        prefix: "Encouraging Coach",
        style: (s) => `Nice — ${s}`,
        neutral: "You're doing well. How can I help?"
      },
      tough: {
        prefix: "Tough Coach",
        style: (s) => `Focus. ${s}`,
        neutral: "Let's lock in. What's next?"
      }
    };
    const voice = personas[persona] ? personas[persona] : personas.encouraging;

    function respond(textLine) {
      return `${voice.prefix}: ${voice.style(textLine)}`;
    }

    // Intent detection (simple keywords/regex for MVP)
    function detectIntent(t) {
      const lower = t.toLowerCase();
      if (/^\s*(help|what can you do)\b/.test(lower)) return { type: "help" };
      if (/\b(get|show|my)\s+(stats|status|readiness|sleep|fatigue)\b/.test(lower)) return { type: "get_stats" };
      if (/\badjust\b.*\bplan\b/.test(lower) || /\brecommend\b.*\bworkout\b/.test(lower)) return { type: "adjust_plan" };
      if (/\blog\b.*\bworkout\b/.test(lower) || /\badd\b.*\bworkout\b/.test(lower)) return { type: "log_workout" };
      return { type: "chat" };
    }

    // Simple parser for "log workout back squat 3x8 @ 70kg"
    function parseWorkout(t) {
      const lower = t.toLowerCase();
      const exMatch = lower.match(/workout\s+([a-z\s_-]+)/i);
      const setsReps = lower.match(/(\d+)\s*[x×]\s*(\d+)/i);
      const load = lower.match(/@?\s*(\d+)\s*(kg|lbs|percent|%)/i);
      const exercise = exMatch ? exMatch[1].replace(/@.+$/, "").trim() : "workout";
      const sets = setsReps ? parseInt(setsReps[1], 10) : undefined;
      const reps = setsReps ? parseInt(setsReps[2], 10) : undefined;
      let load_value, load_unit;
      if (load) {
        load_value = parseInt(load[1], 10);
        load_unit = load[2] === "%" ? "percent" : load[2];
      }
      return { name: exercise, sets, reps, load_value, load_unit };
    }

    // Heuristic adjuster (mirrors /api/adjust-plan)
    function computeAdjustPlan(history = [], stats = {}, user_feedback = "") {
      const plan = {
        new_plan: {
          week: "next",
          exercises: [{ name: "Back Squat", sets: 3, reps: 8, load_percent: 70 }]
        },
        rationale: ""
      };
      if (stats.sleep_hours && stats.sleep_hours < 6) {
        plan.new_plan.exercises[0].reps = 6;
        plan.rationale = "Reduced reps due to low sleep";
      } else if (history.length >= 3) {
        plan.new_plan.exercises[0].load_percent += 2;
        plan.rationale = "Progression recommended based on history";
      } else {
        plan.rationale = "Maintain current load; insufficient history for progression";
      }
      if (/fatig/.test(user_feedback)) {
        plan.new_plan.exercises[0].reps = Math.max(5, plan.new_plan.exercises[0].reps - 2);
        plan.rationale += " — user reported fatigue";
      }
      return plan;
    }

    const intent = detectIntent(userText);

    // Apply side effects first, and collect a tool summary for context
    let tool = null;
    const stats = { sleep_hours: 6.2, fatigue_level: 4, weight_kg: 78, HR_rest: 62 };

    if (intent.type === "help") {
      const reply = respond(
        "I can show your stats, log a workout, or adjust your plan. Try: 'get stats', 'log workout back squat 3x8 @ 70kg', or 'adjust plan'."
      );
      return res.json({ reply, persona, source: "agent", tool });
    }

    if (intent.type === "log_workout") {
      const parsed = parseWorkout(userText);
      const entry = {
        name: parsed.name || "workout",
        sets: parsed.sets || 3,
        reps: parsed.reps || 8,
        load_value: parsed.load_value || null,
        load_unit: parsed.load_unit || null,
        logged_at: new Date().toISOString()
      };
      workoutHistory.push(entry);
      tool = { name: "log_workout", input: parsed, result: entry };
    } else if (intent.type === "adjust_plan") {
      const plan = computeAdjustPlan(workoutHistory, stats, userText);
      tool = { name: "adjust_plan", input: { history: workoutHistory, stats, user_feedback: userText }, result: plan };
    } else if (intent.type === "get_stats") {
      tool = { name: "get_stats", input: {}, result: stats };
    }

    // Build workout progress JSON for LLM context
    const today = new Date().toISOString().slice(0, 10);
    const today_completed = workoutHistory.filter((w) => (w.logged_at || "").slice(0, 10) === today);
    const progress = {
      stats,
      history: workoutHistory.slice(-10),
      today_completed,
      last_action: tool?.name || "chat"
    };

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307";
    const systemPrompt = [
      "You are an AI sports coach with a consistent persona.",
      "Use the selected persona's tone; be concise and actionable.",
      "Consider the user's message and the workout_progress JSON.",
      "Return ONE brief sentence (~140 chars), voice-ready. No emojis. No JSON. No prefix."
    ].join(" ");

    let reply = "";

    if (anthropicKey) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: anthropicKey });
        console.log("Calling Anthropic in /api/message with model:", anthropicModel, "intent:", intent.type);

        const response = await client.messages.create({
          model: anthropicModel,
          max_tokens: 200,
          temperature: 0.4,
          system: `${systemPrompt} Persona selected: "${persona}".`,
          messages: [
            {
              role: "user",
              content:
                `user_text: ${userText || "(none)"}\n` +
                `workout_progress_json: ${JSON.stringify(progress)}`
            }
          ]
        });

        reply = (response?.content?.[0]?.text || "").trim();
      } catch (err) {
        console.warn("Anthropic call failed in /api/message:", err?.message || err);
      }
    }

    // Fallback persona-styled text if LLM missing or failed
    if (!reply) {
      if (tool?.name === "log_workout") {
        const e = tool.result;
        reply = respond(
          `Logged: ${e.name} ${e.sets}x${e.reps}${e.load_value ? " @ " + e.load_value + (e.load_unit || "") : ""}.`
        );
      } else if (tool?.name === "adjust_plan") {
        const ex = tool.result.new_plan.exercises[0];
        reply = respond(`Next: ${ex.name} ${ex.sets}x${ex.reps} @ ${ex.load_percent}%. (${tool.result.rationale})`);
      } else if (tool?.name === "get_stats") {
        reply = respond(
          `Sleep ${stats.sleep_hours}h, fatigue ${stats.fatigue_level}/10, resting HR ${stats.HR_rest} bpm.`
        );
      } else {
        reply = userText ? respond("Got it. Want me to log that or adjust your plan?") : `${voice.prefix}: ${voice.neutral}`;
      }
      return res.json({ reply, persona, source: "agent", tool });
    }

    // LLM path - now with TTS integration
    let audioBuffer = null;
    let audioError = null;
    
    // Generate audio from the reply text using ElevenLabs TTS
    const elevenApiKey = process.env.ELEVENLABS_API_KEY;
    if (elevenApiKey && reply && reply.trim()) {
      try {
        const vid = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
        const model = process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2";
        const ttsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${vid}`;

        const { default: fetch } = await import("node-fetch");
        const ttsResp = await fetch(ttsUrl, {
          method: "POST",
          headers: {
            "xi-api-key": elevenApiKey,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
          },
          body: JSON.stringify({
            text: reply,
            model_id: model,
            optimize_streaming_latency: 0,
            voice_settings: {
              stability: Number(process.env.ELEVENLABS_VOICE_STABILITY || 0.5),
              similarity_boost: Number(process.env.ELEVENLABS_VOICE_SIMILARITY || 0.75)
            }
          })
        });

        if (ttsResp.ok) {
          const arrayBuffer = await ttsResp.arrayBuffer();
          audioBuffer = Buffer.from(arrayBuffer).toString('base64');
          console.log("✅ Generated audio for Anthropic response, size:", audioBuffer.length, "chars (base64)");
        } else {
          const errorText = await ttsResp.text().catch(() => "");
          audioError = `TTS failed: ${ttsResp.status} ${errorText.slice(0, 200)}`;
          console.warn("⚠️ TTS generation failed:", audioError);
        }
      } catch (err) {
        audioError = `TTS error: ${err.message}`;
        console.warn("⚠️ TTS generation error:", err.message);
      }
    } else if (!elevenApiKey) {
      console.log("ℹ️ No ELEVENLABS_API_KEY configured, skipping TTS generation");
    }

    const response = { 
      reply, 
      persona, 
      source: "anthropic", 
      tool,
      audio: audioBuffer ? {
        data: audioBuffer,
        format: "audio/mpeg",
        encoding: "base64"
      } : null,
      audioError: audioError || undefined
    };

    return res.json(response);
  } catch (err) {
    console.error("Error in /api/message:", err);
    res.status(500).json({ error: "server_error" });
  }
});

/**
 * POST /api/generate-plan
 * Accepted body:
 *  { profile: { age, weight_kg, height_cm, experience_level, injuries, equipment, time_per_session_min }, goal: string, duration_weeks: number, frequency_per_week: number }
 *
 * If OPENAI_API_KEY is configured, the server will forward a prompt to OpenAI ChatCompletion to generate a JSON plan that matches the expected schema.
 * If OPENAI_API_KEY is missing or the provider call fails, a mocked sample plan is returned for development.
 */
app.post("/api/generate-plan", async (req, res) => {
  try {
    const body = req.body || {};
    const profile = body.profile || {};
    const goal = body.goal || "general strength";
    const duration = body.duration_weeks || 12;
    const freq = body.frequency_per_week || 3;

    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-2";

    // shared prompt pieces
    const systemPrompt = `You are a fitness coach that outputs strictly a valid JSON object describing a workout plan. The JSON schema must include: plan_name, duration_weeks, frequency_per_week, and days array where each day has day index and exercises array with id,name,sets,reps,tempo,rest_seconds. Keep the response JSON-only.`;
    const userPrompt = `User profile: ${JSON.stringify(profile)}. Goal: ${goal}. Duration weeks: ${duration}. Frequency per week: ${freq}. Provide a plan JSON matching the schema.`;

    // Try OpenAI SDK first if configured
    if (openaiKey) {
      try {
        const { Configuration, OpenAIApi } = require("openai");
        const configuration = new Configuration({ apiKey: openaiKey });
        const openai = new OpenAIApi(configuration);

        const completion = await openai.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 800,
          temperature: 0.2
        });

        const replyText = completion?.data?.choices?.[0]?.message?.content;
        if (replyText) {
          try {
            const plan = JSON.parse(replyText);
            return res.json({ plan, source: "openai" });
          } catch (err) {
            console.warn("Failed to parse OpenAI SDK response as JSON", err);
            // fall through to Anthropic or mock
          }
        } else {
          console.warn("OpenAI SDK returned no text");
        }
      } catch (err) {
        console.warn("OpenAI SDK request failed:", err);
        // fall through to Anthropic
      }
    }

    // Fall back to Anthropic SDK if configured and OpenAI unavailable/failed
    if (anthropicKey) {
      try {
        const { Anthropic } = require("@anthropic-ai/sdk");
        const anthropic = new Anthropic({ apiKey: anthropicKey });

        const response = await anthropic.messages.create({
          model: anthropicModel,
          max_tokens: 2000,
          temperature: 0.2,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt }
          ]
        });

        const replyText = response?.content?.[0]?.text || null;
        if (replyText) {
          try {
            // Strip JSON code block markers if present
            const cleanedText = replyText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
            
            // Check if response appears to be truncated
            if (cleanedText.includes('```json') && !cleanedText.endsWith('}')) {
              console.warn("Anthropic response appears to be truncated - missing closing brace");
              throw new Error("Response truncated");
            }
            
            const plan = JSON.parse(cleanedText);
            return res.json({ plan, source: "anthropic" });
          } catch (err) {
            console.warn("Failed to parse Anthropic SDK response as JSON", err);
            console.warn("Response length:", replyText.length);
            console.warn("Cleaned text length:", cleanedText?.length || 0);
            // fall through to mock
          }
        } else {
          console.warn("Anthropic SDK returned no completion text", response);
        }
      } catch (err) {
        console.warn("Anthropic SDK request failed:", err);
      }
    }

    // Mocked fallback plan if neither provider returns valid plan

    // Mocked fallback plan
    const mockPlan = {
      plan_name: `Mock Plan: ${goal}`,
      duration_weeks: duration,
      frequency_per_week: freq,
      days: [
        {
          day: 1,
          focus: "Lower",
          exercises: [
            { id: "back_squat", name: "Back Squat", sets: 3, reps: 8, tempo: "2-1-2", rest_seconds: 90 }
          ]
        },
        {
          day: 2,
          focus: "Upper",
          exercises: [
            { id: "push_up", name: "Push Ups", sets: 3, reps: 10, tempo: "2-0-2", rest_seconds: 60 }
          ]
        }
      ]
    };
    return res.json({ plan: mockPlan, source: "mock" });
  } catch (err) {
    console.error("Error in /api/generate-plan", err);
    res.status(500).json({ error: "server_error" });
  }
});

/**
 * GET /api/rules/:exercise_id
 * Returns the exercise rule JSON from backend/exercise_rules/<exercise_id>.json
 */
app.get("/api/rules/:exercise_id", (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const exerciseId = String(req.params.exercise_id || "").trim();
    if (!exerciseId) return res.status(400).json({ error: "missing_exercise_id" });
    const rulePath = path.join(__dirname, "exercise_rules", `${exerciseId}.json`);
    if (!fs.existsSync(rulePath)) {
      return res.status(404).json({ error: "unknown_exercise" });
    }
    const ruleJson = JSON.parse(fs.readFileSync(rulePath, "utf8"));
    res.setHeader("Cache-Control", "no-store");
    return res.json(ruleJson);
  } catch (err) {
    console.error("rules endpoint error", err);
    return res.status(500).json({ error: "server_error" });
  }
});

/**
 * POST /api/validate-rep
 * Body: { exercise_id: string, metrics: { hipY, kneeY, torsoAngleDeg, kneeAngle, confidence, ... } }
 * Loads the exercise rule JSON from backend/exercise_rules/<exercise_id>.json and validates metrics.
 * Returns: { valid: boolean, issues: [ { ruleId, severity, message } ], raw: { ruleResults, metrics } }
 */
app.post("/api/validate-rep", async (req, res) => {
  try {
    const { exercise_id, metrics = {} } = req.body || {};
    if (!exercise_id) return res.status(400).json({ error: "missing_exercise_id" });

    const fs = require("fs");
    const path = require("path");
    const rulePath = path.join(__dirname, "exercise_rules", `${exercise_id}.json`);
    if (!fs.existsSync(rulePath)) {
      return res.status(404).json({ error: "unknown_exercise" });
    }
    const ruleJson = JSON.parse(fs.readFileSync(rulePath, "utf8"));

    // Basic validation logic
    const results = [];
    const issues = [];
    const conf = metrics.confidence || 0;
    if (conf < (ruleJson.metrics && ruleJson.metrics.min_confidence ? ruleJson.metrics.min_confidence : 0.4)) {
      results.push({ ruleId: "confidence", severity: "fail", message: "Low keypoint confidence" });
      issues.push({ ruleId: "confidence", severity: "fail", message: "Low keypoint confidence" });
    } else {
      // Apply each rule
      for (const r of (ruleJson.rules || [])) {
        if (r.type === "ratio") {
          // expected metrics: hipY, kneeY. Compute ratio = (hipY - baselineHip) / (kneeY - baselineHip)
          // We'll approximate baselineHip as kneeY - (kneeY - hipY) => simple ratio of displacement
          const hipY = metrics.hipY || 0;
          const kneeY = metrics.kneeY || 0;
          const delta = Math.abs(kneeY - hipY);
          const ratio = delta === 0 ? 0 : Math.abs(hipY - kneeY) / Math.max(1, delta);
          const ok = ratio >= (r.params && r.params.min_ratio ? r.params.min_ratio : 0.35);
          const severity = ok ? "pass" : r.severity || "warn";
          const message = (ruleJson.messages && ruleJson.messages[r.id] && ruleJson.messages[r.id][severity]) || (ok ? "ok" : "rule failed");
          results.push({ ruleId: r.id, ok, severity, message, ratio });
          if (!ok) issues.push({ ruleId: r.id, severity, message });
        } else if (r.type === "max") {
          const value = metrics.torsoAngleDeg || 0;
          const ok = value <= (r.params && r.params.max_deg ? r.params.max_deg : 25);
          const severity = ok ? "pass" : r.severity || "warn";
          const message = (ruleJson.messages && ruleJson.messages[r.id] && ruleJson.messages[r.id][severity]) || (ok ? "ok" : "rule failed");
          results.push({ ruleId: r.id, ok, severity, message, value });
          if (!ok) issues.push({ ruleId: r.id, severity, message });
        } else if (r.type === "min") {
          const value = metrics.kneeAngle || 0;
          const ok = value >= (r.params && r.params.min_deg ? r.params.min_deg : 80);
          const severity = ok ? "pass" : r.severity || "warn";
          const message = (ruleJson.messages && ruleJson.messages[r.id] && ruleJson.messages[r.id][severity]) || (ok ? "ok" : "rule failed");
          results.push({ ruleId: r.id, ok, severity, message, value });
          if (!ok) issues.push({ ruleId: r.id, severity, message });
        } else {
          // unknown rule type: skip
          results.push({ ruleId: r.id, ok: true, severity: "pass", message: "unknown_rule_type_skipped" });
        }
      }
    }

    const valid = !issues.some((i) => i.severity === "fail");
    return res.json({ valid, issues, raw: { results, metrics } });
  } catch (err) {
    console.error("validate-rep error", err);
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

// Text-to-Speech: synthesize speech with ElevenLabs and return audio/mpeg
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice_id, model_id, optimize_streaming_latency } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "missing_text" });
    }

    // Optional rate limiting (disable for MVP by setting TTS_RATE_LIMIT_DISABLED=true)
    const disableRateLimit = String(process.env.TTS_RATE_LIMIT_DISABLED || "").toLowerCase() === "true";

    // Per-phrase rate limit so different mistakes can speak immediately
    const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.ip || "").toString();
    const phraseKey = String(text || "").trim().toLowerCase();
    const nowTs = Date.now();
    const perPhraseCooldown = Number(process.env.TTS_PER_PHRASE_COOLDOWN_MS || 11000);
    const maxRepeats = Number(process.env.TTS_MAX_REPEATS_PER_PHRASE || 3);

    app.locals = app.locals || {};
    app.locals.ttsByIpPhrase = app.locals.ttsByIpPhrase || new Map();

    const mapKey = `${ip}|${phraseKey}`;
    const entry = app.locals.ttsByIpPhrase.get(mapKey) || { lastTs: 0, count: 0 };

    if (!disableRateLimit) {
      // Enforce per-phrase cooldown
      if (nowTs - entry.lastTs < perPhraseCooldown) {
        const retryMs = perPhraseCooldown - (nowTs - entry.lastTs);
        res.setHeader("Retry-After", Math.ceil(retryMs / 1000).toString());
        return res.status(429).json({ error: "rate_limited_phrase", next_allowed_in_ms: retryMs });
      }

      // Enforce per-phrase max repeats
      if (entry.count >= maxRepeats) {
        return res.status(429).json({ error: "max_repeats_reached" });
      }
    }

    // Update entry (pre-emptively to avoid races)
    app.locals.ttsByIpPhrase.set(mapKey, { lastTs: nowTs, count: entry.count + 1 });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      // No key: tell client to fallback locally
      return res.status(501).json({ error: "tts_unavailable" });
    }

    const vid = voice_id || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
    const model = model_id || process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2";
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${vid}`;

    const { default: fetch } = await import("node-fetch");
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        model_id: model,
        optimize_streaming_latency: typeof optimize_streaming_latency === "number" ? optimize_streaming_latency : 0,
        voice_settings: {
          stability: Number(process.env.ELEVENLABS_VOICE_STABILITY || 0.5),
          similarity_boost: Number(process.env.ELEVENLABS_VOICE_SIMILARITY || 0.75)
        }
      })
    });

    if (!resp.ok) {
      const bodyTxt = await resp.text().catch(() => "");
      console.warn("ElevenLabs TTS non-ok", resp.status, bodyTxt);
      return res.status(502).json({ error: "tts_failed", status: resp.status, body: bodyTxt.slice(0, 500) });
    }

    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("TTS error", err);
    return res.status(500).json({ error: "server_error" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
