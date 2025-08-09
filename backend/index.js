/**
 * Backend tool endpoints for AI Sports Coach (minimal)
 *
 * Endpoints:
 * - GET  /api/health
 * - POST /api/analyze       { keypoints }
 * - GET  /api/stats
 * - POST /api/log-workout
 * - POST /api/adjust-plan
 *
 * Use this simple server during development. For production, replace in-memory storage with a DB.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");

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

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
