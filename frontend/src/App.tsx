import React from "react";
import ChatPanel from "./components/ChatPanel";
import CameraFeed from "./components/CameraFeed";

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
          <ChatPanel />
        </section>
      </main>
    </div>
  );
}
