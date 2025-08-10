import React, { useEffect, useRef, useState } from "react";
export default function CameraFeed() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const [statusText, setStatusText] = useState("Initializing camera...");
  const smoothingWindow = useRef<number[]>([]); // for hipY smoothing
  const baselineHip = useRef<number | null>(null);
  const downState = useRef(false);
  const calibrateFrames = 40; // frames to use for baseline calibration
  const calibSamples = useRef<number[]>([]);
  const detectIntervalRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);

  // New: metrics state to render outside the video overlay
  const [metrics, setMetrics] = useState({
    hipY: 0,
    depthThreshold: 0,
    torsoAngleDeg: 0,
    kneeAngle: 0,
    issues: [] as string[]
  });

  useEffect(() => {
    let mounted = true;
    let stream: MediaStream | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (!mounted) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStreaming(true);
          setStatusText("Loading pose model...");
          await initDetectorAndLoop();
        }
      } catch (err: any) {
        setError(err?.message || "Camera permission denied or not available");
        setStatusText("Camera unavailable");
      }
    }

    start();

    return () => {
      mounted = false;
      stopDetectionLoop();
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize TF backend and MoveNet detector (dynamic import)
  async function initDetectorAndLoop() {
    try {
      setStatusText("Initializing TensorFlow backend...");
      // dynamic import to keep initial bundle small
      const tf = await import("@tensorflow/tfjs");
      //const webgl = await import("@tensorflow/tfjs-backend-webgl");
      await tf.setBackend("webgl");
      await tf.ready();

      const posedetection = await import("@tensorflow-models/pose-detection");
      // Create MoveNet detector
      const detector = await posedetection.createDetector(posedetection.SupportedModels.MoveNet, {
        modelType: posedetection.movenet.modelType.SINGLEPOSE_LIGHTNING
      });
      detectorRef.current = detector;

      setStatusText("Model loaded. Calibrating baseline (please stand still)...");
      // start periodic detection loop
      startDetectionLoop(detector, 150); // run detection every ~150ms
    } catch (err: any) {
      console.error("Failed to init detector", err);
      setError("Failed to initialize pose detector: " + (err?.message || err));
      setStatusText("Model init failed");
    }
  }

  function startDetectionLoop(detector: any, intervalMs = 200) {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    performance.now();
    async function step() {
      if (!video || video.readyState < 2) {
        detectIntervalRef.current = window.setTimeout(step, intervalMs);
        return;
      }
      try {
        const poses = await detector.estimatePoses(video);
        // use first detected pose
        const pose = poses && poses.length ? poses[0] : null;

        // Only draw overlays; do NOT draw the video frame to avoid duplication/ghosting
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (pose) {
          const keypoints = pose.keypoints || pose;
          drawKeypoints(ctx, keypoints);
          drawSkeleton(ctx, keypoints);
          processPoseMetrics(keypoints);
        }
      } catch (err) {
        console.warn("pose detect err", err);
      } finally {
        detectIntervalRef.current = window.setTimeout(step, intervalMs);
      }
    }

    // set canvas size to match video display size
    function syncCanvas() {
      if (!video || !canvas) return;
      const w = video.videoWidth || video.clientWidth || 640;
      const h = video.videoHeight || video.clientHeight || 480;
      canvas.width = Math.min(640, w);
      canvas.height = Math.min(480, h);
    }
    syncCanvas();
    step();
  }

  function stopDetectionLoop() {
    if (detectIntervalRef.current) {
      window.clearTimeout(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }
    if (detectorRef.current) {
      try {
        detectorRef.current.dispose && detectorRef.current.dispose();
      } catch {}
      detectorRef.current = null;
    }
  }

  // drawing helpers
  function drawKeypoints(ctx: CanvasRenderingContext2D, keypoints: any[]) {
    ctx.fillStyle = "rgba(0,255,160,0.9)";
    for (const kp of keypoints) {
      if (kp.score != null && kp.score < 0.3) continue;
      const x = (kp.x / (videoRef.current?.videoWidth || canvasRef.current?.width || 1)) * (canvasRef.current?.width || 0);
      const y = (kp.y / (videoRef.current?.videoHeight || canvasRef.current?.height || 1)) * (canvasRef.current?.height || 0);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSkeleton(ctx: CanvasRenderingContext2D, keypoints: any[]) {
    ctx.strokeStyle = "rgba(0,200,255,0.8)";
    ctx.lineWidth = 2;
    // pairs from MoveNet keypoint indexing (use common pairs)
    const pairs = [
      [0, 1], [1, 3], [0, 2], [2, 4],
      [5, 7], [7, 9], [6, 8], [8, 10],
      [5, 6], [11, 12], [12, 14], [14, 16], [11, 13], [13, 15]
    ];
    const w = videoRef.current?.videoWidth || canvasRef.current?.width || 1;
    const h = videoRef.current?.videoHeight || canvasRef.current?.height || 1;
    function mapped(p: any) {
      return {
        x: (p.x / w) * (canvasRef.current?.width || 0),
        y: (p.y / h) * (canvasRef.current?.height || 0)
      };
    }
    for (const [a, b] of pairs) {
      const pa = keypoints[a];
      const pb = keypoints[b];
      if (!pa || !pb) continue;
      if ((pa.score != null && pa.score < 0.3) || (pb.score != null && pb.score < 0.3)) continue;
      const A = mapped(pa);
      const B = mapped(pb);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }
  }

  // compute metrics and rep detection
  function processPoseMetrics(keypoints: any[]) {
    // helper to find keypoint by name or index
    function kp(nameOrIndex: any) {
      if (typeof nameOrIndex === "number") return keypoints[nameOrIndex];
      return keypoints.find((k: any) => k.name === nameOrIndex || k.part === nameOrIndex);
    }
    const leftHip = kp("left_hip") || kp(11) || kp("leftHip") || kp("hip_left");
    const rightHip = kp("right_hip") || kp(12) || kp("rightHip") || kp("hip_right");
    const leftKnee = kp("left_knee") || kp(13) || kp("leftKnee");
    const rightKnee = kp("right_knee") || kp(14) || kp("rightKnee");
    const leftAnkle = kp("left_ankle") || kp(15) || kp("leftAnkle");
    const rightAnkle = kp("right_ankle") || kp(16) || kp("rightAnkle");
    const leftShoulder = kp("left_shoulder") || kp(5) || kp("leftShoulder");
    const rightShoulder = kp("right_shoulder") || kp(6) || kp("rightShoulder");

    if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
      // not enough keypoints
      setStatusText("Waiting for full body in frame...");
      return;
    }

    // choose hip/knee/ankle side with higher score
    const hip = (leftHip.score || 0) > (rightHip.score || 0) ? leftHip : rightHip;
    const knee = (leftKnee.score || 0) > (rightKnee.score || 0) ? leftKnee : rightKnee;
    const ankle = (leftAnkle.score || 0) > (rightAnkle.score || 0) ? leftAnkle : rightAnkle;
    const shoulder = (leftShoulder.score || 0) > (rightShoulder.score || 0) ? leftShoulder : rightShoulder;

    // normalize coords to canvas pixels
    const canvasW = canvasRef.current?.width || 1;
    const canvasH = canvasRef.current?.height || 1;
    const vW = videoRef.current?.videoWidth || canvasW;
    const vH = videoRef.current?.videoHeight || canvasH;

    const hipY = (hip.y / vH) * canvasH;
    const kneeY = (knee.y / vH) * canvasH;
    const ankleY = (ankle.y / vH) * canvasH;
    const shoulderY = (shoulder.y / vH) * canvasH;

    // smoothing window (rolling average)
    smoothingWindow.current.push(hipY);
    if (smoothingWindow.current.length > 6) smoothingWindow.current.shift();
    const avgHipY = smoothingWindow.current.reduce((a, b) => a + b, 0) / smoothingWindow.current.length;

    // calibration: collect initial baseline hip while user stands
    if (baselineHip.current === null) {
      calibSamples.current.push(avgHipY);
      if (calibSamples.current.length >= calibrateFrames) {
        // use median to be robust
        const sorted = [...calibSamples.current].sort((a, b) => a - b);
        baselineHip.current = sorted[Math.floor(sorted.length / 2)];
        setStatusText("Calibrated baseline. Start squatting to detect reps.");
        console.log("Calibrated baselineHip:", baselineHip.current);
      } else {
        setStatusText(`Calibrating... stand still (${calibSamples.current.length}/${calibrateFrames})`);
        return;
      }
    }

    // compute depth threshold: some fraction between baselineHip and kneeY
    // since y increases downward, kneeY > baselineHip. threshold lower means deeper squat.
    const depthThreshold = baselineHip.current + 0.35 * (kneeY - baselineHip.current);

    // compute torso angle (vector from hip to shoulder, angle from vertical)
    function angleBetween(a: { x: number; y: number }, b: { x: number; y: number }) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return Math.atan2(dy, dx);
    }
    // approximate torso angle in degrees from vertical
    const hipX = (hip.x / vW) * canvasW;
    const shoulderX = (shoulder.x / vW) * canvasW;
    const torsoAngleRad = Math.abs(angleBetween({ x: hipX, y: hipY }, { x: shoulderX, y: shoulderY }) - Math.PI / 2);
    const torsoAngleDeg = (torsoAngleRad * 180) / Math.PI;

    // knee angle at knee using hip-knee-ankle
    function computeAngle(a: any, b: any, c: any) {
      // angle at point b between ba and bc
      const ax = (a.x / vW) * canvasW;
      const ay = (a.y / vH) * canvasH;
      const bx = (b.x / vW) * canvasW;
      const by = (b.y / vH) * canvasH;
      const cx = (c.x / vW) * canvasW;
      const cy = (c.y / vH) * canvasH;
      const v1 = { x: ax - bx, y: ay - by };
      const v2 = { x: cx - bx, y: cy - by };
      const dot = v1.x * v2.x + v1.y * v2.y;
      const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
      const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
      if (mag1 * mag2 === 0) return 0;
      let ang = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
      return (ang * 180) / Math.PI;
    }
    const kneeAngle = computeAngle(hip, knee, ankle);

    // rep detection state machine
    const isDown = avgHipY > depthThreshold;
    if (!downState.current && isDown) {
      // transitioned down
      downState.current = true;
      console.log("Down detected");
    } else if (downState.current && !isDown) {
      // transitioned up from down -> count a rep
      downState.current = false;
      setRepCount((c) => {
        const nc = c + 1;
        console.log("Rep counted ->", nc);
        return nc;
      });
    }

    // Provide feedback conditions
    const issues: string[] = [];
    if (torsoAngleDeg > 25) issues.push("leaning_forward");
    if (kneeAngle < 80) issues.push("insufficient_knee_angle");
    if (avgHipY < baselineHip.current + 5) issues.push("not_much_movement");

    // instead of drawing text on the canvas overlay (which gets mirrored), push metrics into state
    setMetrics({
      hipY: avgHipY,
      depthThreshold,
      torsoAngleDeg,
      kneeAngle,
      issues
    });
  }

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
        <div className="status-row">
          <p className="status-text">{statusText}</p>
        </div>

        {/* New: metrics panel rendered as DOM so it is not mirrored and readable */}
        <div className="metrics-panel" role="region" aria-label="Pose metrics">
          <div className="metrics-row"><strong>Reps:</strong> {repCount}</div>
          <div className="metrics-row"><strong>Hip Y:</strong> {metrics.hipY.toFixed(1)}</div>
          <div className="metrics-row"><strong>Depth Thr:</strong> {metrics.depthThreshold.toFixed(1)}</div>
          <div className="metrics-row"><strong>Torso:</strong> {metrics.torsoAngleDeg.toFixed(0)}°</div>
          <div className="metrics-row"><strong>Knee:</strong> {metrics.kneeAngle.toFixed(0)}°</div>
          <div className="metrics-row"><strong>Issues:</strong> {metrics.issues.length ? metrics.issues.join(", ") : "none"}</div>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => { console.log("Export last metrics", metrics); alert("Metrics logged to console."); }}>
              Export metrics (debug)
            </button>
          </div>
        </div>

        <div className="camera-help">
          <p>Tip: position full body in frame for squat detection.</p>
        </div>
      </div>
    </div>
  );
}
