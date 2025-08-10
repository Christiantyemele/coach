import React, { useState } from "react";
import ChatPanel from "./components/ChatPanel";
import PlanGenerator from "./components/PlanGenerator";
import RoutineRunner from "./components/RoutineRunner";

export default function App() {
  const [activePlan, setActivePlan] = useState<any | null>(null);

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI Sports Coach — MVP</h1>
      </header>
      <main className="app-main">
        <section className="left-pane">
          {/* RoutineRunner renders CameraFeed and routine UI; pass the plan generated on the right */}
          <RoutineRunner plan={activePlan} startDay={1} />
        </section>
        <section className="right-pane">
          <PlanGenerator onPlanGenerated={(p) => setActivePlan(p)} />
          <div style={{ height: 12 }} />
          <ChatPanel />
        </section>
      </main>
    </div>
  );
}
