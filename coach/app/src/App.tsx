import React from "react";
import ChatPanel from "./components/ChatPanel";
import CameraFeed from "./components/CameraFeed";
import PlanGenerator from "./components/PlanGenerator";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>AI Sports Coach — MVP</h1>
      </header>
      <main className="app-main">
        <section className="left-pane">
          <CameraFeed />
        </section>
        <section className="right-pane">
          <PlanGenerator />
          <div style={{ height: 12 }} />
          <ChatPanel />
        </section>
      </main>
    </div>
  );
}
