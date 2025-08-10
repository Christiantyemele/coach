/**
 * POST /api/coach-say
 * Body: { text: string, persona?: "encouraging" | "tough" | string, progress?: object }
 * Calls LLM with persona + workout progress JSON and returns a short, voice-ready reply.
 */
app.post("/api/coach-say", async (req, res) => {
  try {
    const { text = "", persona = "encouraging", progress = {} } = req.body || {};
    const userText = String(text || "").trim();
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307";

    // System prompt: persona and output constraints (concise, voice-ready)
    const systemPrompt = [
      "You are an AI sports coach speaking in a consistent persona.",
      "Requirements:",
      "- Use the selected persona's tone and energy.",
      "- Consider the user's utterance and the provided workout_progress JSON.",
      "- Give one brief, actionable coaching response (max ~140 characters).",
      "- No prefaces like 'Coach:'; no emojis; no JSON; just the sentence.",
      "- If the progress JSON suggests safety concerns, prioritize safety.",
      `Persona selected: "${persona}".`
    ].join(" ");

    // If no API key, return a deterministic fallback
    if (!anthropicKey) {
      const summary = progress && typeof progress === "object"
        ? (() => {
            try { return JSON.stringify(progress); } catch { return ""; }
          })()
        : "";
      const reply =
        persona === "tough"
          ? `Push with control. ${userText ? userText + ". " : ""}Stay on pace and keep form tight.`
          : `Nice work. ${userText ? userText + ". " : ""}Focus on clean form and steady breathing.`;
      return res.json({ reply, persona, source: "mock", debug: summary ? { progress_len: summary.length } : undefined });
    }

    // Call Anthropic for a persona-aware reply
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: anthropicKey });
      console.log("Calling Anthropic in /api/coach-say with model:", anthropicModel);

      const response = await client.messages.create({
        model: anthropicModel,
        max_tokens: 200,
        temperature: 0.4,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content:
              `user_text: ${userText || "(none)"}\n` +
              `workout_progress_json: ${JSON.stringify(progress)}`
          }
        ]
      });

      const replyText = response?.content?.[0]?.text?.trim?.() || "";
      const reply = replyText || (persona === "tough"
        ? "Focus. Keep your chest up and drive through the heels."
        : "Great pace — keep your chest up and breathe.");
      return res.json({ reply, persona, source: "anthropic" });
    } catch (err) {
      console.warn("Anthropic call failed in /api/coach-say:", err?.message || err);
      const reply =
        persona === "tough"
          ? "Hold form. Tight core, smooth tempo."
          : "Keep it smooth — tight core and steady tempo.";
      return res.json({ reply, persona, source: "fallback" });
    }
  } catch (err) {
    console.error("Error in /api/coach-say:", err);
    res.status(500).json({ error: "server_error" });
  }
});

/**
 * POST /api/voice-coach
 * Multipart fields:
 *   - file: audio blob
 *   - persona: "encouraging" | "tough" | string
 *   - progress: JSON string or object describing user's daily workout progress
 *
 * Pipeline:
 *   1) STT (ElevenLabs) -> transcript
 *   2) LLM (Anthropic) -> persona-aware coaching reply (short, actionable)
 *   3) TTS (ElevenLabs) -> audio/mpeg (returned as response body)
 *
 * Notes:
 *   - Returns Content-Type: audio/mpeg with the synthesized reply.
 *   - Adds X-Transcript header with the transcript (for debugging clients).
 *   - Falls back gracefully if any stage fails while keeping response fast.
 */
app.post("/api/voice-coach", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const persona = (req.body && req.body.persona) || "encouraging";
    let progress = req.body && req.body.progress;
    try {
      if (typeof progress === "string") progress = JSON.parse(progress);
      if (progress === undefined || progress === null) progress = {};
    } catch {
      progress = {};
    }

    if (!file) {
      return res.status(400).json({ error: "no_file" });
    }

    const elevenApiKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenApiKey) {
      // Without ElevenLabs key, we can't produce voice; return transcript mock and 501
      return res.status(501).json({ error: "tts_unavailable", note: "Missing ELEVENLABS_API_KEY" });
    }

    // 1) STT: transcribe with ElevenLabs
    const FormData = require("form-data");
    const sttForm = new FormData();
    sttForm.append("file", file.buffer, {
      filename: file.originalname || "recording.webm",
      contentType: file.mimetype || "audio/webm"
    });
    sttForm.append("model_id", process.env.ELEVENLABS_STT_MODEL || "general");
    const { default: fetch } = await import("node-fetch");
    const STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
    const sttHeaders = sttForm.getHeaders();
    sttHeaders["xi-api-key"] = elevenApiKey;

    let transcript = "";
    try {
      const sttResp = await fetch(STT_URL, { method: "POST", headers: sttHeaders, body: sttForm });
      if (sttResp.ok) {
        const j = await sttResp.json().catch(() => ({}));
        if (typeof j.text === "string") transcript = j.text;
        else if (typeof j.transcript === "string") transcript = j.transcript;
        else if (Array.isArray(j.words)) transcript = j.words.map((w) => w.text).join(" ");
        else transcript = "";
      } else {
        // fallback: empty transcript is OK; we will still reply based on persona
        transcript = "";
      }
    } catch {
      transcript = "";
    }

    // 2) LLM: persona-aware reply
    let reply = "";
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307";
    const systemPrompt = [
      "You are an AI sports coach with a consistent persona.",
      "Use the selected persona's tone; be concise, actionable, and supportive.",
      "Consider the user's utterance and the provided workout_progress JSON.",
      "Return ONE brief sentence (~140 chars), voice-ready. No emojis. No JSON. No prefix."
    ].join(" ");

    if (anthropicKey) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: anthropicKey });
        console.log("Calling Anthropic in /api/voice-coach with model:", anthropicModel);

        const response = await client.messages.create({
          model: anthropicModel,
          max_tokens: 160,
          temperature: 0.4,
          system: `${systemPrompt} Persona selected: "${persona}".`,
          messages: [
            {
              role: "user",
              content:
                `user_text: ${transcript || "(none)"}\n` +
                `workout_progress_json: ${JSON.stringify(progress)}`
            }
          ]
        });
        reply = (response?.content?.[0]?.text || "").trim();
      } catch (err) {
        console.warn("Anthropic in /api/voice-coach failed:", err?.message || err);
        reply = "";
      }

        // Always attempt TTS with ElevenLabs; fall back to JSON on error
        try {
          const apiKey = process.env.ELEVENLABS_API_KEY;
          if (!apiKey) throw new Error("ELEVENLABS_API_KEY missing");
          const { default: fetch } = await import("node-fetch");
          const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
          const ttsModel = process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2";
          const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
          const ttsResp = await fetch(url, {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
              Accept: "audio/mpeg"
            },
            body: JSON.stringify({
              text: reply,
              model_id: ttsModel,
              optimize_streaming_latency: Number(process.env.ELEVENLABS_TTS_LATENCY || 0) || 0,
              voice_settings: {
                stability: Number(process.env.ELEVENLABS_VOICE_STABILITY || 0.5),
                similarity_boost: Number(process.env.ELEVENLABS_VOICE_SIMILARITY || 0.75)
              }
            })
          });
          if (ttsResp.ok) {
            const ab = await ttsResp.arrayBuffer();
            const buf = Buffer.from(ab);
            res.setHeader("Content-Type", "audio/mpeg");
            res.setHeader("X-Reply", encodeURIComponent(reply));
            res.setHeader("X-Source", "agent");
            return res.status(200).send(buf);
          }
        } catch (e) {
          console.warn("TTS synth failed in /api/message (fallback path):", e?.message || e);
        }
    }
    if (!reply) {
      reply =
        persona === "tough"
          ? "Focus. Tight core and smooth tempo."
          : "Nice work — keep your chest up and breathe.";
    }

    // 3) TTS: synthesize reply with ElevenLabs
    const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
    const ttsModel = process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2";
    const TTS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const ttsResp = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        "xi-api-key": elevenApiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg"
      },
      body: JSON.stringify({
        text: reply,
        model_id: ttsModel,
        optimize_streaming_latency: Number(process.env.ELEVENLABS_TTS_LATENCY || 0) || 0,
        voice_settings: {
          stability: Number(process.env.ELEVENLABS_VOICE_STABILITY || 0.5),
          similarity_boost: Number(process.env.ELEVENLABS_VOICE_SIMILARITY || 0.75)
        }
      })
    });

    if (!ttsResp.ok) {
      const bodyTxt = await ttsResp.text().catch(() => "");
      console.warn("TTS failed:", ttsResp.status, bodyTxt);
      return res.status(502).json({ error: "tts_failed" });
    }

    const ab = await ttsResp.arrayBuffer();
    const buf = Buffer.from(ab);
    res.setHeader("Content-Type", "audio/mpeg");
    if (transcript) res.setHeader("X-Transcript", encodeURIComponent(transcript));
    return res.status(200).send(buf);
  } catch (err) {
    console.error("voice-coach error", err);
    return res.status(500).json({ error: "server_error" });
  }
});

/**
 * Helper: synthesize TTS with ElevenLabs, return Buffer (audio/mpeg)
 */
async function synthesizeElevenLabs(text) {
  const { default: fetch } = await import("node-fetch");
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY missing");
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const ttsModel = process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2";
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg"
    },
    body: JSON.stringify({
      text,
      model_id: ttsModel,
      optimize_streaming_latency: Number(process.env.ELEVENLABS_TTS_LATENCY || 0) || 0,
      voice_settings: {
        stability: Number(process.env.ELEVENLABS_VOICE_STABILITY || 0.5),
        similarity_boost: Number(process.env.ELEVENLABS_VOICE_SIMILARITY || 0.75)
      }
    })
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed: ${resp.status} ${body.slice(0, 200)}`);
  }
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * POST /api/message-voice
 * Body: { text: string, persona?: "encouraging" | "tough", progress?: object }
 * Calls Anthropic to craft persona-aware reply, then synthesizes with ElevenLabs, and returns audio/mpeg.
 * Headers:
 *  - X-Reply: URL-encoded reply text (for client display/logging)
 *  - X-Source: "anthropic" | "fallback"
 */
app.post("/api/message-voice", async (req, res) => {
  try {
    const { text = "", persona = "encouraging", progress = {} } = req.body || {};
    const userText = String(text || "").trim();

    // Build minimal progress context (ok if empty)
    const stats = { sleep_hours: 6.2, fatigue_level: 4, weight_kg: 78, HR_rest: 62 };
    const ctx = {
      stats,
      history: (globalThis.workoutHistory || []).slice?.(-10) || [],
      last_action: "chat",
      ...(typeof progress === "object" ? progress : {})
    };

    // Craft voice-ready reply with Anthropic if available
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307";
    const systemPrompt = [
      "You are an AI sports coach with a consistent persona.",
      "Use the selected persona's tone; be concise and actionable.",
      "Consider the user's message and the workout_progress JSON.",
      "Return ONE brief sentence (~140 chars), voice-ready. No emojis. No JSON. No prefix."
    ].join(" ");

    let reply = "";
    let source = "fallback";

    if (anthropicKey) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: anthropicKey });
        console.log("Calling Anthropic in /api/message-voice with model:", anthropicModel);

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
                `workout_progress_json: ${JSON.stringify(ctx)}`
            }
          ]
        });

        reply = (response?.content?.[0]?.text || "").trim();
        source = "anthropic";
      } catch (err) {
        console.warn("Anthropic call failed in /api/message-voice:", err?.message || err);
      }
    }

    if (!reply) {
      reply =
        persona === "tough"
          ? "Focus. Tight core and smooth tempo."
          : "Nice work — keep your chest up and breathe.";
    }

    // Synthesize with ElevenLabs and return audio/mpeg
    const audio = await synthesizeElevenLabs(reply);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("X-Reply", encodeURIComponent(reply));
    res.setHeader("X-Source", source);
    return res.status(200).send(audio);
  } catch (err) {
    console.error("message-voice error", err);
    return res.status(500).json({ error: "server_error" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
