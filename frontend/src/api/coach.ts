export type CoachSpeakInput = {
  text: string;
  persona?: string;
  progress?: Record<string, any>;
};

export type CoachSpeakResponse = {
  reply: string;
  persona: string;
  source: "anthropic" | "mock" | "fallback";
  debug?: any;
};

export async function coachSpeak(body: CoachSpeakInput): Promise<CoachSpeakResponse> {
  const resp = await fetch("/api/coach-say", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  if (!resp.ok) {
    throw new Error(`coach-say failed: ${resp.status}`);
  }
  return resp.json();
}
