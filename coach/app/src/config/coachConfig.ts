export const coachConfig = {
  // Give the athlete a short window to self-correct before feedback
  patienceMs: 1500, // 1.5s

  // Cooldown before repeating the same correction
  perIssueCooldownMs: 8000, // 8s

  // Allow immediate correction for new/different mistakes
  allowImmediateForNewIssue: true,

  // Max repeats per mistake per session
  maxRepeatsPerIssue: 3, // Keeps feedback from feeling naggy

  // Good form duration before cooldown reset
  goodFormResetMs: 5000, // 5s

  // Gap between any TTS feedback to prevent overlap
  globalSoftRequestMs: 2000, // 2s

  // Time between praise messages
  praiseCooldownMs: 10000, // 10s

  // Backoff if TTS API rate limits and no Retry-After provided
  ttsBackoffOn429Ms: 8000, // 8s

  // Limit concurrent TTS calls to avoid audio overlap
  maxConcurrentTts: 1, // Always keep at 1 for clarity

  // Rep detection thresholds
  repMinAmplitudePx: 24,       // Good balance for most exercises
  repMinIntervalMs: 1000,      // 1s minimum between reps for realistic pacing
  repMinConfidence: 0.6,       // Slightly higher than 0.55 for accuracy

  // MVP aggressive TTS mode (use sparingly, e.g., for testing)
  mvpAggressiveTts: false,     // Disable for production to prevent spam
  mvpTtsIntervalMs: 3000       // Only relevant if aggressive mode is on
};
