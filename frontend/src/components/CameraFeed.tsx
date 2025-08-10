import React, { useEffect, useRef, useState } from "react";
import { applyExerciseRules, type ExerciseRuleSpec } from "../utils/ruleValidator";

import {coachConfig} from "../config/coachConfig";
export default function CameraFeed({ exerciseId = "back_squat" }: { exerciseId?: string }) {
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

  // Local analyze + TTS helpers
  const latestKeypointsRef = useRef<any[] | null>(null);
  const lastIssuesHashRef = useRef<string>("");
  const lastSpeakTsRef = useRef<number>(0);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsUrlRef = useRef<string | null>(null);

  // Rep gating helpers (fix: ensure refs exist for amplitude/time gating)
  const hipHistoryRef = useRef<number[]>([]);
  const lastRepTsRef = useRef<number>(0);

    // Latest active tip text to say (updated by analysis)
    const lastTipTextRef = useRef<string>("");

    // Ensure a persistent audio element exists in DOM (helps with autoplay policies)
    useEffect(() => {
      if (!ttsAudioRef.current) {
        const el = document.createElement("audio");
        el.id = "tts-audio";
        el.autoplay = false;
        el.preload = "auto";
        el.crossOrigin = "anonymous";
        (el as any).playsInline = true;
        el.style.display = "none";
        el.volume = 1.0;
        document.body.appendChild(el);
        ttsAudioRef.current = el;
      }
      return () => {
        // keep element for app lifetime; do not remove to preserve user gesture allowance
      };
    }, []);

    // MVP: periodic speaker loop that forces TTS when there is an active tip
    useEffect(() => {
      if (!coachConfig.mvpAggressiveTts) return;
      const id = window.setInterval(() => {
        const tip = (lastTipTextRef.current || "").trim();
        if (tip) {
          // bypass backoff and in-flight gates for MVP
          speakTexts([tip], { force: true, bypassBackoff: true });
        }
      }, Math.max(1000, coachConfig.mvpTtsIntervalMs || 3000));
      return () => window.clearInterval(id);
  }, []);

  // Anti-spam controls
  const ttsInFlightRef = useRef<boolean>(false);
  const ttsBackoffUntilRef = useRef<number>(0); // global backoff timestamp
  const perPhraseNextAllowedRef = useRef<Map<string, number>>(new Map()); // phrase -> nextAllowedAt

  // Cooldowns
  const perPhraseCooldownRef = useRef<Map<string, number>>(new Map()); // phrase -> last spoken ts
  const lastTtsRequestTsRef = useRef<number>(0); // global gate for /api/tts
  const currentPlayingTextRef = useRef<string>(""); // avoid interrupting same text

  // New: metrics state to render outside the video overlay
  const [metrics, setMetrics] = useState({
    hipY: 0,
    depthThreshold: 0,
    torsoAngleDeg: 0,
    kneeAngle: 0,
    issues: [] as string[]
  });

  // Load exercise rule spec via backend API (proxied in dev)
  const [ruleSpec, setRuleSpec] = useState<ExerciseRuleSpec | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/rules/${exerciseId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`rules_not_found:${r.status}`))))
      .then((json) => {
        if (alive) setRuleSpec(json);
      })
      .catch((err) => {
        console.warn("Failed to load exercise rules:", err);
        if (alive) setRuleSpec(null);
      });
    return () => {
      alive = false;
    };
  }, [exerciseId]);

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

  // ElevenLabs TTS with strong anti-spam: in-flight mutex, per-phrase/global backoff, Retry-After respect
  async function speakTexts(texts: string[], opts?: { force?: boolean }) {
    const line = texts.join(". ").trim();
    if (!line) return;

    const now = Date.now();
    const phraseKey = line.toLowerCase();

    // Avoid interrupting identical phrase that's already playing
    if (currentPlayingTextRef.current === phraseKey && ttsAudioRef.current && !ttsAudioRef.current.paused) {
      return;
    }

    // Respect global backoff after any 429
    if (now < ttsBackoffUntilRef.current) return;

    // Respect per-phrase nextAllowed
    const nextAllowed = perPhraseNextAllowedRef.current.get(phraseKey) || 0;
    if (now < nextAllowed) return;

    // Optional soft global throttle (does not bypass backoff)
    if (!opts?.force && coachConfig.globalSoftRequestMs > 0) {
      if (now - lastTtsRequestTsRef.current < coachConfig.globalSoftRequestMs) {
        return;
      }
    }

    // Debounce identical batches briefly
    const hash = texts.join("|");
    if (!opts?.force && hash === lastIssuesHashRef.current && now - lastSpeakTsRef.current < 1500) return;
    lastIssuesHashRef.current = hash;
    lastSpeakTsRef.current = now;

    // Only one TTS request at a time
    if (coachConfig.maxConcurrentTts <= 0) return;
    if (ttsInFlightRef.current) return;
    ttsInFlightRef.current = true;

    try {
      const resp = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: line })
      });

      if (resp.status === 429) {
        // Parse Retry-After or JSON for next allowed and set backoff
        let retryMs = coachConfig.ttsBackoffOn429Ms;
        const retryAfter = resp.headers.get("Retry-After");
        if (retryAfter) {
          const sec = Number(retryAfter);
          if (!Number.isNaN(sec) && sec > 0) retryMs = Math.max(retryMs, sec * 1000);
        } else {
          try {
            const j = await resp.clone().json();
            if (typeof j?.next_allowed_in_ms === "number") {
              retryMs = Math.max(retryMs, j.next_allowed_in_ms);
            }
          } catch {}
        }
        const until = Date.now() + retryMs;
        ttsBackoffUntilRef.current = Math.max(ttsBackoffUntilRef.current, until);
        perPhraseNextAllowedRef.current.set(phraseKey, until);
        return; // no fallback; we’ll try later automatically
      }

      const contentType = resp.headers.get("Content-Type") || "";
      if (!resp.ok || !contentType.includes("audio")) {
        throw new Error("tts_unavailable_or_not_audio");
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);

      if (!ttsAudioRef.current) {
        ttsAudioRef.current = new Audio();
        ttsAudioRef.current.onended = () => {
          currentPlayingTextRef.current = "";
        };
      } else {
        try { ttsAudioRef.current.pause(); } catch {}
        if (ttsUrlRef.current) URL.revokeObjectURL(ttsUrlRef.current);
      }

      ttsUrlRef.current = url;
      currentPlayingTextRef.current = phraseKey;
      lastTtsRequestTsRef.current = Date.now();

      ttsAudioRef.current.src = url;

      try {
        await ttsAudioRef.current.play();
      } catch (playErr) {
        // If the browser blocks playback (autoplay policy), fall back to Web Speech
        try {
          if (typeof window !== "undefined" && "speechSynthesis" in window) {
            const msg = new SpeechSynthesisUtterance(line);
            msg.rate = 1.0;
            msg.pitch = 1.0;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(msg);
          }
        } catch {}
      }
    } catch {
      // Keep silent on error to avoid chatter; next loop may retry after cooldown/backoff
      return;
    } finally {
      ttsInFlightRef.current = false;
    }
  }

  // compute metrics, simple rep detection, and local analysis + TTS
  function processPoseMetrics(keypoints: any[]) {
    latestKeypointsRef.current = keypoints;

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
      setStatusText("Waiting for full body in frame...");
      setMetrics((m) => ({ ...m, issues: ["low_confidence"] }));
      return;
    }

    // choose hip/knee/ankle side with higher score
    const hip = (leftHip.score || 0) > (rightHip.score || 0) ? leftHip : rightHip;
    const knee = (leftKnee.score || 0) > (rightKnee.score || 0) ? leftKnee : rightKnee;
    const ankle = (leftAnkle.score || 0) > (rightAnkle.score || 0) ? leftAnkle : rightAnkle;
    const shoulder = (leftShoulder?.score || 0) > (rightShoulder?.score || 0) ? leftShoulder : rightShoulder;

    // normalize coords to canvas pixels
    const canvasW = canvasRef.current?.width || 1;
    const canvasH = canvasRef.current?.height || 1;
    const vW = videoRef.current?.videoWidth || canvasW;
    const vH = videoRef.current?.videoHeight || canvasH;

    const hipX = (hip.x / vW) * canvasW;
    const hipY = (hip.y / vH) * canvasH;
    const kneeX = (knee.x / vW) * canvasW;
    const kneeY = (knee.y / vH) * canvasH;
    const ankleX = (ankle.x / vW) * canvasW;
    const ankleY = (ankle.y / vH) * canvasH;
    const shoulderX = (shoulder?.x / vW) * canvasW;
    const shoulderY = (shoulder?.y / vH) * canvasH;

    // smoothing window (rolling average)
    smoothingWindow.current.push(hipY);
    if (smoothingWindow.current.length > 6) smoothingWindow.current.shift();
    const avgHipY = smoothingWindow.current.reduce((a, b) => a + b, 0) / smoothingWindow.current.length;

    // calibration: collect initial baseline hip while user stands
    if (baselineHip.current === null) {
      calibSamples.current.push(avgHipY);
      if (calibSamples.current.length >= calibrateFrames) {
        const sorted = [...calibSamples.current].sort((a, b) => a - b);
        baselineHip.current = sorted[Math.floor(sorted.length / 2)];
        setStatusText("Calibrated baseline. Start squatting to detect reps.");
      } else {
        setStatusText(`Calibrating... stand still (${calibSamples.current.length}/${calibrateFrames})`);
        return;
      }
    }

    // compute depth threshold: between baseline and knee
    const depthThreshold = baselineHip.current + 0.35 * (kneeY - baselineHip.current);

    // torso angle in degrees from vertical
    const angleRad = Math.atan2(shoulderY - hipY, shoulderX - hipX);
    const torsoAngleDeg = Math.abs((angleRad - Math.PI / 2) * (180 / Math.PI)); // 0 = vertical

    // knee angle (hip-knee-ankle), degrees
    function angleAtKnee(hx: number, hy: number, kx: number, ky: number, ax: number, ay: number) {
      const v1x = hx - kx, v1y = hy - ky;
      const v2x = ax - kx, v2y = ay - ky;
      const dot = v1x * v2x + v1y * v2y;
      const n1 = Math.hypot(v1x, v1y);
      const n2 = Math.hypot(v2x, v2y);
      if (n1 === 0 || n2 === 0) return 180;
      const cos = Math.max(-1, Math.min(1, dot / (n1 * n2)));
      return Math.acos(cos) * (180 / Math.PI);
    }
    const kneeAngle = angleAtKnee(hipX, hipY, kneeX, kneeY, ankleX, ankleY);

    // Compute average confidence across key lower-body joints (0..1)
    const scores = [
      leftHip?.score, rightHip?.score,
      leftKnee?.score, rightKnee?.score,
      leftAnkle?.score, rightAnkle?.score
    ].filter((s: any) => typeof s === "number") as number[];
    const confidence = scores.length ? Math.max(0, Math.min(1, scores.reduce((a, b) => a + b, 0) / scores.length)) : 0;

    // Metrics bag for rule validation
    const metricsBag = {
      hipY: avgHipY,
      kneeY,
      torsoAngleDeg: Number(torsoAngleDeg.toFixed(1)),
      kneeAngle: Number(kneeAngle.toFixed(1)),
      confidence
    };

    // Compute average confidence across key joints (0..1) for rep gating
    const jointScores = [
      leftHip?.score, rightHip?.score,
      leftKnee?.score, rightKnee?.score,
      leftAnkle?.score, rightAnkle?.score
    ].filter((s: any) => typeof s === "number") as number[];
    const avgConf = jointScores.length ? jointScores.reduce((a, b) => a + b, 0) / jointScores.length : 0;

    // Track hipY history for amplitude gating
    hipHistoryRef.current = hipHistoryRef.current || [];
    hipHistoryRef.current.push(avgHipY);
    if (hipHistoryRef.current.length > 20) hipHistoryRef.current.shift(); // ~ last 20 frames

    const minHip = Math.min(...hipHistoryRef.current);
    const maxHip = Math.max(...hipHistoryRef.current);
    const amplitudePx = Math.abs(maxHip - minHip);

    // Time gating
    const nowTs = Date.now();
    lastRepTsRef.current = lastRepTsRef.current || 0;

    // Only allow rep detection if movement amplitude and confidence are sufficient
    const movementOK = amplitudePx >= coachConfig.repMinAmplitudePx;
    const confidenceOK = avgConf >= coachConfig.repMinConfidence;
    const intervalOK = nowTs - lastRepTsRef.current >= coachConfig.repMinIntervalMs;

    // Robust rep detection: require all three gates
    if (movementOK && confidenceOK) {
      // down-phase when passing threshold
      if (!downState.current && avgHipY >= depthThreshold) {
        downState.current = true;
      }
      // count rep when rising back up past near-baseline
      const upThreshold = baselineHip.current + 0.1 * (kneeY - baselineHip.current);
      if (downState.current && avgHipY <= upThreshold && intervalOK) {
        downState.current = false;
        lastRepTsRef.current = nowTs;
        setRepCount((c) => c + 1);
        // reset window to avoid counting jitter
        hipHistoryRef.current = [];
      }
    } else {
      // If not moving/confident, don't carry downState to avoid false positives
      downState.current = false;
    }

    if (ruleSpec) {
      const { issues: ruleIssues, results } = applyExerciseRules(metricsBag, ruleSpec);

      // Update metrics panel with failed rule IDs
      setMetrics({
        hipY: avgHipY,
        depthThreshold,
        torsoAngleDeg: Number(torsoAngleDeg.toFixed(1)),
        kneeAngle: Number(kneeAngle.toFixed(1)),
        issues: results.filter(r => !r.ok).map(r => r.ruleId)
      });

      const now = Date.now();

      if (ruleIssues.length === 0) {
        // Positive reinforcement occasionally using pass messages if available
        const passed = results.filter(r => r.ok && ruleSpec.messages?.[r.ruleId]?.pass);
        // Track sustained good form to reset issue cooldowns
        if (goodFormSinceRef.current == null) goodFormSinceRef.current = now;
        const goodDuration = now - (goodFormSinceRef.current || now);

        if (goodDuration >= coachConfig.goodFormResetMs) {
          // Reset cooldowns so future feedback can be re-issued if needed
          issueFirstSeenRef.current.clear();
          issueLastSpokenRef.current.clear();
          issueSpokenCountRef.current.clear();
          goodFormSinceRef.current = now; // continue tracking
        }

        // Optionally praise, not too often
        if (passed.length && coachConfig.praiseCooldownMs > 0) {
          // Pick one pass message to show in UI; speaking praise is optional
          const msg = (ruleSpec.messages?.[passed[0].ruleId]?.pass) as string;
          setStatusText(msg || "Good form");
        } else {
          setStatusText("Good form");
        }
      } else {
        // Reset good-form timer
        goodFormSinceRef.current = null;

        // Choose one issue to speak (prioritize 'fail' over 'warn')
        const primary = ruleIssues.sort((a, b) => (a.severity === "fail" ? -1 : 1))[0];
        const issueKey = primary.ruleId;
        const message = primary.message;

        // Patience: wait a bit before speaking, to allow self-correction
        const firstSeen = issueFirstSeenRef.current.get(issueKey) || now;
        if (!issueFirstSeenRef.current.has(issueKey)) {
          issueFirstSeenRef.current.set(issueKey, now);
        }

        const lastSpoken = issueLastSpokenRef.current.get(issueKey) || 0;
        const spokenCount = issueSpokenCountRef.current.get(issueKey) || 0;

        const pastPatience = now - firstSeen >= coachConfig.patienceMs;
        const cooledDown = now - lastSpoken >= coachConfig.perIssueCooldownMs;
        const underRepeatCap = spokenCount < coachConfig.maxRepeatsPerIssue;

        // If a different mistake occurs, allow immediate (force) after patience
        const forceNewIssue = coachConfig.allowImmediateForNewIssue && pastPatience && cooledDown;

        // Always record the tip for the periodic speaker loop
        lastTipTextRef.current = message;

        if (pastPatience && cooledDown && underRepeatCap) {
          setStatusText("Form tip: " + message);
          // Force speaking even if soft global throttle would block it
          speakTexts([message], { force: forceNewIssue });
          issueLastSpokenRef.current.set(issueKey, now);
          issueSpokenCountRef.current.set(issueKey, spokenCount + 1);
        } else {
          // Update UI only
          setStatusText("Form tip: " + message);
        }

        // For other currently failing issues, initialize their firstSeen for patience timing
        for (const i of ruleIssues) {
          if (!issueFirstSeenRef.current.has(i.ruleId)) {
            issueFirstSeenRef.current.set(i.ruleId, now);
          }
        }
      }
    } else {
      // Fallback if rules not loaded yet: provide simple local guidance
      const fallbackMsgs: string[] = [];
      const issueIds: string[] = [];
      if (avgHipY < depthThreshold) {
        fallbackMsgs.push("Depth insufficient: try lowering your hip until it reaches knee level.");
        issueIds.push("depth_ratio");
      }
      if (torsoAngleDeg > 30) {
        fallbackMsgs.push("You are leaning forward; keep your chest up.");
        issueIds.push("torso_angle");
      }

      // Always update metrics so the debug panel reflects current values
      setMetrics({
        hipY: avgHipY,
        depthThreshold,
        torsoAngleDeg: Number(torsoAngleDeg.toFixed(1)),
        kneeAngle: Number(kneeAngle.toFixed(1)),
        issues: issueIds
      });

      setStatusText(fallbackMsgs.length ? "Form tip: " + fallbackMsgs.join(" | ") : "Good form");
      if (fallbackMsgs.length) {
        // Remember the tip for the periodic speaker loop and speak immediately (MVP)
        lastTipTextRef.current = fallbackMsgs[0];
        speakTexts(fallbackMsgs, { force: true, bypassBackoff: true });
      } else {
        lastTipTextRef.current = "";
      }
    }
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
