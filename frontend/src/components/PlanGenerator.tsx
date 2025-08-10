import React, { useState } from "react";

/**
 * PlanGenerator
 * - Simple guided form for user profile and goal
 * - POSTs to /api/generate-plan and displays returned plan JSON (or mock)
 * - Useful for demo: generate a month/quarter/year plan from user input
 */

export default function PlanGenerator({ onPlanGenerated }: { onPlanGenerated?: (plan: any) => void }) {
  const [profile, setProfile] = useState({
    age: 30,
    weight_kg: 75,
    height_cm: 175,
    experience: "beginner",
    injuries: "",
    equipment: "barbell"
  });
  const [goal, setGoal] = useState("Build strength and muscle");
  const [duration, setDuration] = useState(12);
  const [frequency, setFrequency] = useState(3);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<any | null>(null);
  const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || "";

  async function generatePlan() {
    setLoading(true);
    setPlan(null);
    try {
      const res = await fetch((BACKEND_URL || "") + "/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          goal,
          duration_weeks: duration,
          frequency_per_week: frequency
        })
      });
      const data = await res.json();
      if (data && data.plan) {
        setPlan(data.plan);
        // notify parent so RoutineRunner can start tracking the routine
        onPlanGenerated?.(data.plan);
      } else {
        setPlan({ error: "No plan returned", raw: data });
      }
    } catch (err) {
      console.error("generatePlan error", err);
      setPlan({ error: "Network error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="plan-generator">
      <h3>Generate Workout Plan</h3>

      <div style={{ display: "grid", gap: 8 }}>
        <label>
          Goal:
          <input value={goal} onChange={(e) => setGoal(e.target.value)} />
        </label>

        <label style={{ display: "flex", gap: 8 }}>
          Duration (weeks):
          <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={{ width: 80 }} />
          Frequency / week:
          <input type="number" value={frequency} onChange={(e) => setFrequency(Number(e.target.value))} style={{ width: 80 }} />
        </label>

        <label>
          Experience:
          <select value={profile.experience} onChange={(e) => setProfile({ ...profile, experience: e.target.value })}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>

        <label>
          Equipment (comma-separated):
          <input value={profile.equipment} onChange={(e) => setProfile({ ...profile, equipment: e.target.value })} />
        </label>

        <label>
          Injuries / constraints:
          <input value={profile.injuries} onChange={(e) => setProfile({ ...profile, injuries: e.target.value })} />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={generatePlan} disabled={loading}>
            {loading ? "Generating..." : "Generate Plan"}
          </button>
          <button onClick={() => { setPlan(null); }}>Clear</button>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <h4>Generated Plan</h4>
        <pre style={{ maxHeight: 320, overflow: "auto", background: "rgba(0,0,0,0.5)", padding: 8 }}>
          {plan ? JSON.stringify(plan, null, 2) : "No plan yet"}
        </pre>
      </div>
    </div>
  );
}
