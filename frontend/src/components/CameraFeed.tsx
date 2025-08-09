import React, { useEffect, useRef, useState } from "react";

/**
 * CameraFeed
 * - Requests camera permission and renders video
 * - Provides a canvas overlay where pose keypoints can be drawn
 * - Hook to integrate MoveNet/TF.js: extract video element ref and process frames
 *
 * For Hour 3–6: integrate @tensorflow-models/pose-detection and implement rep detection logic.
 */

export default function CameraFeed() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (!mounted) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStreaming(true);
        }
      } catch (err: any) {
        setError(err?.message || "Camera permission denied or not available");
      }
    }
    startCamera();
    return () => {
      mounted = false;
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div className="camera-feed">
      <div className="video-wrapper">
        {error ? (
          <div className="camera-error">Camera error: {error}</div>
        ) : (
          <>
            <video ref={videoRef} className="video" playsInline muted width="480" height="360" />
            <canvas ref={canvasRef} className="overlay" width={480} height={360} />
            {!streaming && <div className="camera-hint">Waiting for camera...</div>}
          </>
        )}
      </div>
      <div className="camera-info">
        <p>Pose preview (MoveNet integration planned).</p>
        <p>Tip: position full body in frame for squat detection.</p>
      </div>
    </div>
  );
}
