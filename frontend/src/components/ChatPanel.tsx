import React, { useEffect, useRef, useState } from "react";

/**
 * ChatPanel with robust speech handling and a VU meter:
 * - Handles SpeechRecognition 'network' errors by falling back to MediaRecorder.
 * - Opens a microphone stream for an AnalyserNode to compute an audio level (VU meter) for development.
 * - Ensures final transcripts and text Send button POST to /api/message (sendTextToBackend).
 *
 * Note: attempting to get an audio stream while SpeechRecognition runs may fail on some browsers;
 * this code uses a best-effort approach and logs helpful messages to dev console.
 */

type Message = { from: string; text: string };

export default function ChatPanel() {
  const [persona, setPersona] = useState<string>("encouraging");
  const [recording, setRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { from: "system", text: "Ready. Select persona and press Start." }
  ]);
  const [input, setInput] = useState("");
  const [audioLevel, setAudioLevel] = useState(0); // 0..1 for VU meter

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Uint8Array | null>(null);
  const audioAnimationRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || "";

  useEffect(() => {
    // Initialize Web Speech API recognition if available
    const SpeechRecognition: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.continuous = true;

      rec.onresult = (event: any) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) final += res[0].transcript;
          else interim += res[0].transcript;
        }

        // Update UI with interim/final transcript but avoid duplicates:
        setMessages((m) => {
          const last = m[m.length - 1];
          let base = m;
          if (last && last.from === "transcript") base = m.slice(0, -1);

          const textToShow = final || interim;
          if (!textToShow) return base;
          return [...base, { from: "transcript", text: textToShow }];
        });

        // If we have a final transcript, treat it as a user message and send to backend
        if (final && final.trim()) {
          setMessages((m) => {
            const last = m[m.length - 1];
            let base = m;
            if (last && last.from === "transcript") base = m.slice(0, -1);
            return [...base, { from: "user", text: final }];
          });
          // Send to backend for agent reply
          sendTextToBackend(final, persona).catch((e) => {
            console.error("sendTextToBackend error:", e);
            setMessages((m) => [...m, { from: "system", text: "Failed to get reply from server." }]);
          });
        }
      };

      rec.onerror = (err: any) => {
        console.warn("SpeechRecognition error", err);
        // If we get a 'network' error or other fatal error, fall back to MediaRecorder
        const errorName = err && (err.error || err.type);
        if (errorName === "network" || errorName === "not-allowed" || errorName === "service-not-allowed") {
          setMessages((m) => [...m, { from: "system", text: `SpeechRecognition error (${errorName}). Falling back to recorder.` }]);
          // stop the recognition and start media fallback
          try {
            recognitionRef.current && recognitionRef.current.stop();
          } catch {}
          startMediaFallback().catch((e) => {
            console.error("startMediaFallback failed", e);
            setMessages((m) => [...m, { from: "system", text: "Microphone fallback failed." }]);
          });
        } else {
          // Log other errors; continue
          setMessages((m) => [...m, { from: "system", text: `SpeechRecognition error: ${errorName || "unknown"}` }]);
        }
      };

      rec.onstart = () => {
        console.log("SpeechRecognition onstart");
        setRecording(true);
      };
      rec.onend = () => {
        console.log("SpeechRecognition onend");
        setRecording(false);
      };

      recognitionRef.current = rec;
    }

    // cleanup on unmount
    return () => {
      stopAudioAnalyser();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start an analyser/VU meter from the mic stream (best-effort). Returns the MediaStream for recording if caller wants it.
  async function startAudioAnalyser(): Promise<MediaStream | null> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      audioAnalyserRef.current = analyser;
      audioDataRef.current = dataArray;

      function update() {
        if (!audioAnalyserRef.current || !audioDataRef.current) return;
        audioAnalyserRef.current.getByteTimeDomainData(audioDataRef.current);
        // compute RMS
        let sum = 0;
        for (let i = 0; i < audioDataRef.current.length; i++) {
          const v = (audioDataRef.current[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / audioDataRef.current.length);
        // simple smoothing
        setAudioLevel((prev) => Math.max(0, Math.min(1, prev * 0.7 + rms * 0.3)));
        audioAnimationRef.current = requestAnimationFrame(update);
      }
      audioAnimationRef.current = requestAnimationFrame(update);
      return stream;
    } catch (err) {
      console.warn("startAudioAnalyser failed (mic may be in use or permission denied):", err);
      return null;
    }
  }

  function stopAudioAnalyser() {
    if (audioAnimationRef.current) {
      cancelAnimationFrame(audioAnimationRef.current);
      audioAnimationRef.current = null;
    }
    if (audioAnalyserRef.current) {
      try {
        audioAnalyserRef.current.disconnect();
      } catch {}
      audioAnalyserRef.current = null;
    }
    if (audioStreamRef.current) {
      try {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      audioStreamRef.current = null;
    }
    audioDataRef.current = null;
    setAudioLevel(0);
  }

  async function startMediaFallback() {
    // Start mic + analyser then MediaRecorder
    const stream = await startAudioAnalyser();
    if (!stream) throw new Error("no_stream");
    audioChunksRef.current = [];
    const options: MediaRecorderOptions = { mimeType: "audio/webm" };
    const mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    mediaRecorder.onstart = () => {
      setRecording(true);
      setMessages((m) => [...m, { from: "system", text: "Recording audio (fallback)..." }]);
    };

    mediaRecorder.onstop = async () => {
      setRecording(false);
      setMessages((m) => [...m, { from: "system", text: "Recording stopped. Uploading..." }]);
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      try {
        const transcript = await uploadAudioAndGetTranscript(blob);
        if (transcript) {
          setMessages((m) => [...m, { from: "user", text: "(voice) " + transcript }]);
          await sendTextToBackend(transcript, persona);
        } else {
          setMessages((m) => [...m, { from: "system", text: "(no transcript returned)" }]);
        }
      } catch (err: any) {
        console.error("Upload error", err);
        setMessages((m) => [...m, { from: "system", text: "Failed to upload audio." }]);
      } finally {
        stopAudioAnalyser();
      }
    };

    mediaRecorder.start();
  }

  async function startRecording() {
    // Try using SpeechRecognition first (low latency transcripts)
    const SpeechRecognition: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition && recognitionRef.current) {
      try {
        // start audio analyser in parallel for VU meter (best effort)
        startAudioAnalyser().catch((e) => console.warn("audio analyser while using SpeechRecognition failed:", e));
        recognitionRef.current.start();
        setMessages((m) => [...m, { from: "system", text: "SpeechRecognition started (browser native)." }]);
        return;
      } catch (err) {
        console.warn("Could not start SpeechRecognition", err);
        // fall through to MediaRecorder
      }
    }

    // Fallback to MediaRecorder via startMediaFallback
    try {
      await startMediaFallback();
    } catch (err) {
      console.error("startMediaFallback error", err);
      setMessages((m) => [...m, { from: "system", text: "Microphone fallback failed." }]);
    }
  }

  function stopRecording() {
    // Stop SpeechRecognition if active
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setRecording(false);
      setMessages((m) => [...m, { from: "system", text: "SpeechRecognition stopped." }]);
      stopAudioAnalyser();
      return;
    }

    // Stop MediaRecorder if running
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      try {
        mr.stop();
      } catch (err) {
        console.warn("Error stopping MediaRecorder", err);
      } finally {
        stopAudioAnalyser();
      }
    } else {
      setRecording(false);
      setMessages((m) => [...m, { from: "system", text: "Not recording." }]);
      stopAudioAnalyser();
    }
  }

  async function uploadAudioAndGetTranscript(blob: Blob): Promise<string | null> {
    // POST multipart/form-data to backend /api/voice
    try {
      const form = new FormData();
      form.append("file", blob, "recording.webm");
      // Append persona so backend/agent can use persona context if desired
      form.append("persona", persona);

      const url = (BACKEND_URL ? BACKEND_URL : "") + "/api/voice";
      console.log("POST /api/voice ->", url);
      const res = await fetch(url, {
        method: "POST",
        body: form
      });
      console.log("voice endpoint status", res.status);
      if (!res.ok) {
        console.warn("Voice endpoint returned error", res.status);
        return null;
      }
      const data = await res.json();
      // expected { transcript: "..." }
      console.log("voice endpoint response", data);
      return data.transcript || null;
    } catch (err) {
      console.error("uploadAudioAndGetTranscript error", err);
      throw err;
    }
  }

  function toggleRecording() {
    if (recording) stopRecording();
    else startRecording();
  }

  async function sendTextToBackend(text: string, persona: string) {
    try {
      const url = (BACKEND_URL ? BACKEND_URL : "") + "/api/message";
      console.log("POST /api/message ->", url, { text, persona });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, persona })
      });
      console.log("message endpoint status", res.status);
      if (!res.ok) {
        setMessages((m) => [...m, { from: "system", text: `Server returned ${res.status}` }]);
        return;
      }
      const data = await res.json();
      console.log("message endpoint response", data);
      if (data && data.reply) {
        setMessages((m) => [...m, { from: "coach", text: data.reply }]);
      } else {
        setMessages((m) => [...m, { from: "coach", text: "(no reply)" }]);
      }
    } catch (err) {
      console.error("sendTextToBackend error", err);
      setMessages((m) => [...m, { from: "system", text: "Failed to contact server." }]);
    }
  }

  function sendText() {
    if (!input.trim()) return;
    // Send the text to backend for a reply
    setMessages((m) => [...m, { from: "user", text: input }]);
    sendTextToBackend(input, persona);
    setInput("");
  }

  return (
    <div className="chat-panel">
      <div className="controls">
        <label>
          Persona:
          <select value={persona} onChange={(e) => setPersona(e.target.value)}>
            <option value="encouraging">Encouraging Coach</option>
            <option value="tough">Tough Coach</option>
          </select>
        </label>
        <button onClick={toggleRecording}>{recording ? "Stop" : "Start"} Voice</button>
      </div>

      <div className="vu-meter" style={{ margin: "8px 0" }}>
        <div style={{ height: 8, width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
          <div
            style={{
              height: "100%",
              width: `${Math.round(audioLevel * 100)}%`,
              background: "linear-gradient(90deg,#61dafb,#2bd4a0)",
              borderRadius: 4,
              transition: "width 60ms linear"
            }}
          />
        </div>
      </div>

      <div className="messages" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.from}`}>
            <strong>{m.from}:</strong> <span>{m.text}</span>
          </div>
        ))}
      </div>

      <div className="composer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message (fallback) ..."
        />
        <button onClick={sendText}>Send</button>
      </div>
    </div>
  );
}
