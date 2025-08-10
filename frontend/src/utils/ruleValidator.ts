// Types kept loose to accommodate different rule sets
export type ExerciseRuleSpec = {
  id: string;
  name: string;
  description?: string;
  metrics?: {
    required?: string[];
    min_confidence?: number;
  };
  rules: Array<{
    id: string;
    type: "ratio" | "max" | "min";
    params?: Record<string, number>;
    severity?: "pass" | "warn" | "fail";
    description?: string;
  }>;
  messages?: Record<
    string,
    {
      pass?: string;
      warn?: string;
      fail?: string;
    }
  >;
};

export type Metrics = Record<string, number>;

export type RuleResult = {
  ruleId: string;
  ok: boolean;
  severity: "pass" | "warn" | "fail";
  message: string;
  value?: number;
  ratio?: number;
};

export function applyExerciseRules(metrics: Metrics, spec: ExerciseRuleSpec) {
  const results: RuleResult[] = [];
  const issues: { ruleId: string; severity: "warn" | "fail"; message: string }[] = [];

  const minConf = spec.metrics?.min_confidence ?? 0;
  const confidence = Number(metrics.confidence ?? 0);
  if (confidence < minConf) {
    results.push({ ruleId: "confidence", ok: false, severity: "fail", message: "Low keypoint confidence" });
    issues.push({ ruleId: "confidence", severity: "fail", message: "Low keypoint confidence" });
    return { valid: false, results, issues };
  }

  for (const r of spec.rules || []) {
    if (r.type === "ratio") {
      // Expect hipY, kneeY; compute normalized displacement ratio
      const hipY = Number(metrics.hipY ?? 0);
      const kneeY = Number(metrics.kneeY ?? 0);
      const delta = Math.abs(kneeY - hipY);
      const ratio = delta === 0 ? 0 : Math.abs(hipY - kneeY) / Math.max(1, delta);
      const minRatio = r.params?.min_ratio ?? 0.35;
      const ok = ratio >= minRatio;
      const severity = ok ? "pass" as const : (r.severity ?? "warn");
      const message =
        spec.messages?.[r.id]?.[severity] ??
        (ok ? "ok" : "Depth insufficient");
      results.push({ ruleId: r.id, ok, severity, message, ratio });
      if (!ok && (severity === "warn" || severity === "fail")) {
        issues.push({ ruleId: r.id, severity, message });
      }
    } else if (r.type === "max") {
      // Expect metric like torsoAngleDeg with max_deg
      const value = Number(metrics.torsoAngleDeg ?? 0);
      const maxDeg = r.params?.max_deg ?? 25;
      const ok = value <= maxDeg;
      const severity = ok ? "pass" as const : (r.severity ?? "warn");
      const message =
        spec.messages?.[r.id]?.[severity] ??
        (ok ? "ok" : "Value exceeds max");
      results.push({ ruleId: r.id, ok, severity, message, value });
      if (!ok && (severity === "warn" || severity === "fail")) {
        issues.push({ ruleId: r.id, severity, message });
      }
    } else if (r.type === "min") {
      // Expect metric like kneeAngle with min_deg
      const value = Number(metrics.kneeAngle ?? 0);
      const minDeg = r.params?.min_deg ?? 80;
      const ok = value >= minDeg;
      const severity = ok ? "pass" as const : (r.severity ?? "warn");
      const message =
        spec.messages?.[r.id]?.[severity] ??
        (ok ? "ok" : "Value below min");
      results.push({ ruleId: r.id, ok, severity, message, value });
      if (!ok && (severity === "warn" || severity === "fail")) {
        issues.push({ ruleId: r.id, severity, message });
      }
    } else {
      // Unknown rule; mark as pass
      results.push({ ruleId: r.id, ok: true, severity: "pass", message: "unknown_rule_skipped" });
    }
  }

  const valid = !issues.some((i) => i.severity === "fail");
  return { valid, results, issues };
}
