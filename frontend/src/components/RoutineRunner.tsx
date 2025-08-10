import React, { useEffect, useMemo, useRef, useState } from "react";
import CameraFeed from "./CameraFeed";

type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: number;
  rest_seconds?: number;
  tempo?: string;
};

type DayPlan = {
  day: number;
  focus?: string;
  exercises: Exercise[];
};

type Plan = {
  plan_name: string;
  duration_weeks: number;
  frequency_per_week: number;
  days: DayPlan[];
};

type Props = {
  plan?: Plan | null;
  startDay?: number; // 1-based day index to use from plan
};

export default function RoutineRunner({ plan: planProp, startDay = 1 }: Props) {
  const [plan, setPlan] = useState<Plan | null>(planProp || null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dayIndex, setDayIndex] = useState(Math.max(0, startDay - 1));
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [setIndex, setSetIndex] = useState(0);

  const [isResting, setIsResting] = useState(false);
  const [restLeft, setRestLeft] = useState(0);
  const restTimerRef = useRef<number | null>(null);

  const [liveReps, setLiveReps] = useState(0);

  // Keep internal plan in sync with prop
  useEffect(() => {
    if (planProp) setPlan(planProp);
  }, [planProp]);

  const todayExercises = useMemo<Exercise[]>(() => {
    if (!plan || !plan.days || !plan.days[dayIndex]) return [];
    return plan.days[dayIndex].exercises || [];
  }, [plan, dayIndex]);

  const currentExercise = todayExercises[exerciseIndex] || null;

  // Optionally fetch a quick plan if none provided (fallback)
  async function loadQuickPlan() {
    try {
      setLoadingPlan(true);
      setError(null);
      const resp = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: { experience_level: "beginner" },
          goal: "general strength",
          duration_weeks: 4,
          frequency_per_week: 3
        })
      });
      const json = await resp.json();
      if (json?.plan) setPlan(json.plan);
      else throw new Error("no_plan");
      setExerciseIndex(0);
      setSetIndex(0);
    } catch (e: any) {
      setError(e?.message || "Failed to load plan");
    } finally {
      setLoadingPlan(false);
    }
  }

  // Load most recent generated plan saved by PlanGenerator
  function loadSavedPlan() {
    try {
      const raw = localStorage.getItem("lastPlan");
      if (!raw) {
        setError("No saved plan found. Generate one on the right.");
        return;
      }
      const p = JSON.parse(raw);
      setPlan(p);
      setExerciseIndex(0);
      setSetIndex(0);
      setError(null);
    } catch (e: any) {
      setError("Failed to parse saved plan");
    }
  }

  // Listen for rep-complete events from CameraFeed to track live rep count
  useEffect(() => {
    const onRep = (e: any) => {
      const next = typeof e?.detail?.count === "number" ? e.detail.count : liveReps + 1;
      setLiveReps(next);
    };
    window.addEventListener("rep-complete", onRep as any);
    return () => window.removeEventListener("rep-complete", onRep as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Advance to next set or exercise
  function finishSet() {
    if (!currentExercise) return;
    // Log set completion to backend
    try {
      fetch("/api/log-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercise_id: currentExercise.id,
          name: currentExercise.name,
          set_number: setIndex + 1,
          target_reps: currentExercise.reps,
          completed_reps: liveReps,
          logged_at: new Date().toISOString()
        })
      }).catch(() => {});
    } catch {}

    const nextSet = setIndex + 1;
    const totalSets = currentExercise.sets || 1;
    const rest = Number(currentExercise.rest_seconds || 60);

    if (nextSet < totalSets) {
      // Start rest countdown then advance
      setIsResting(true);
      setRestLeft(rest);
      if (restTimerRef.current) window.clearInterval(restTimerRef.current);
      restTimerRef.current = window.setInterval(() => {
        setRestLeft((s) => {
          if (s <= 1) {
            window.clearInterval(restTimerRef.current!);
            restTimerRef.current = null;
            setIsResting(false);
            setSetIndex(nextSet);
            setLiveReps(0);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      // Move to next exercise
      nextExercise();
    }
  }

  function nextExercise() {
    setLiveReps(0);
    setSetIndex(0);
    if (exerciseIndex + 1 < todayExercises.length) {
      setExerciseIndex(exerciseIndex + 1);
    } else {
      // Completed all exercises for the day
      alert("Day complete — great job!");
    }
  }

  function skipExercise() {
    setLiveReps(0);
    setSetIndex(0);
    if (exerciseIndex + 1 < todayExercises.length) {
      setExerciseIndex(exerciseIndex + 1);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16 }}>
      <div>
        {/* Pose + validation */}
        <div style={{ marginBottom: 8 }}>
          <strong>Current Exercise:</strong>{" "}
          {currentExercise ? `${currentExercise.name} (${setIndex + 1}/${currentExercise.sets})` : "None"}
        </div>
        {/* Pass exerciseId so CameraFeed loads matching rules via /api/rules/:id */}
        <CameraFeed exerciseId={currentExercise?.id || "back_squat"} />
      </div>

      <div style={{ padding: 12, background: "rgba(0,0,0,0.5)", color: "#fff", borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>Routine</h3>
        {!plan && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={loadSavedPlan} disabled={loadingPlan}>
              Use saved plan
            </button>
            <button onClick={loadQuickPlan} disabled={loadingPlan}>
              {loadingPlan ? "Loading..." : "Load quick plan (fallback)"}
            </button>
            {error && <div style={{ color: "#ff6" }}>Error: {error}</div>}
          </div>
        )}
        {plan && (
          <>
            <div style={{ margin: "6px 0" }}>
              <div><strong>{plan.plan_name}</strong></div>
              <div>Day {dayIndex + 1} of {plan.days.length}</div>
            </div>

            <div style={{ margin: "6px 0", maxHeight: 220, overflowY: "auto", background: "rgba(255,255,255,0.05)", padding: 8, borderRadius: 6 }}>
              {todayExercises.map((ex, i) => (
                <div key={i} style={{ padding: 6, borderRadius: 4, background: i === exerciseIndex ? "rgba(0,120,255,0.25)" : "transparent" }}>
                  {i + 1}. {ex.name} — {ex.sets} x {ex.reps}{ex.rest_seconds ? `, rest ${ex.rest_seconds}s` : ""}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 10 }}>
              <div>Live reps (from camera): <strong>{liveReps}</strong></div>
              <div>Set: <strong>{setIndex + 1}</strong> / {currentExercise?.sets || 0}</div>
              <div>Rest: <strong>{isResting ? `${restLeft}s` : "—"}</strong></div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={finishSet} disabled={!currentExercise || isResting}>Finish Set</button>
              <button onClick={skipExercise} disabled={!currentExercise}>Skip</button>
              <button onClick={nextExercise} disabled={!currentExercise}>Next Exercise</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
