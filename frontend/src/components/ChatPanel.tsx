import React, { useState } from "react";

/**
 * ChatPanel
 * - Minimal UI to start/stop voice (hook up to ElevenLabs later)
 * - Persona selector (maps to agent persona)
 * - Transcript and messages list
 *
 * Replace mocked responses with real ElevenLabs integration in Hour 0.5–3 tasks.
 */

export default function ChatPanel() {
  const [persona, setPersona] = useState<string>("encouraging");
  const [listening, setListening] = useState<boolean>(false);
  const [messages, setMessages] = useState<Array<{ from: string; text: string }>>([
    { from: "system", text: "Ready. Select persona and press Start." }
  ]);
  const [input, setInput] = useState("");

  function toggleListening() {
    // placeholder; integrate microphone streaming to ElevenLabs in next steps
    setListening((s) => !s);
    setMessages((m) => [
      ...m,
      { from: "system", text: listening ? "Stopped listening." : "Started listening (mock)." }
    ]);
  }

  function sendText() {
    if (!input.trim()) return;
    // For now we mock a reply. Replace with agent call.
    setMessages((m) => [...m, { from: "user", text: input }, { from: "coach", text: `(${persona}) mock reply to: ${input}` }]);
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
        <button onClick={toggleListening}>{listening ? "Stop" : "Start"} Voice (mock)</button>
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
