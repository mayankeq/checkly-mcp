import { api, ChecklyConfig } from "../client.js";

// Minimal types — Checkly returns richer objects but we only need these fields
interface Check {
  id: string;
  name: string;
  checkType: string;
  activated: boolean;
  frequency: number;
  frequencyOffset?: number;
  script?: string;
  request?: Record<string, unknown>;
  locations: string[];
  tags?: string[];
  groupId?: number;
  degradedResponseTime?: number;
  maxResponseTime?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown; // preserve unknown fields for PUT round-trip
}

interface CheckResult {
  id: string;
  checkId: string;
  hasFailures: boolean;
  hasErrors: boolean;
  isDegraded: boolean;
  overMaxResponseTime: boolean;
  runLocation: string;
  startedAt: string;
  stoppedAt: string;
  responseTime: number;
}

interface CheckSession {
  checkSessionId: string;
  checkSessionLink: string;
  checkId: string;
  checkType: string;
  name: string;
  status: "PROGRESS" | "PASSED" | "FAILED";
  startedAt: string;
  stoppedAt: string | null;
  timeElapsed: number;
  runLocations: string[];
  results?: unknown[];
}

export async function listChecks(
  config: ChecklyConfig,
  params: { type?: string; groupId?: string; limit?: number }
) {
  // Note: the API does not support checkType as a query param — filter client-side.
  const qs = new URLSearchParams();
  if (params.groupId) qs.set("groupId", params.groupId);
  qs.set("limit", String(params.limit ?? 100));

  const checks = await api.get<Check[]>(config, `/v1/checks?${qs}`);
  const filtered = params.type
    ? checks.filter((c) => c.checkType === params.type)
    : checks;

  return filtered.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.checkType,
    activated: c.activated,
    frequency: c.frequency,
    locations: c.locations,
    tags: c.tags ?? [],
    groupId: c.groupId ?? null,
    updatedAt: c.updatedAt,
  }));
}

export async function getCheck(config: ChecklyConfig, id: string) {
  return api.get<Check>(config, `/v1/checks/${id}`);
}

export async function updateCheck(
  config: ChecklyConfig,
  id: string,
  updates: {
    script?: string;
    name?: string;
    activated?: boolean;
    frequency?: number;
  },
  confirm: boolean
) {
  if (config.readOnly) {
    return {
      error:
        "Server is in read-only mode. Set CHECKLY_READ_ONLY=false to enable writes.",
    };
  }

  // Fetch current state for diff preview and PUT round-trip
  const current = await api.get<Check>(config, `/v1/checks/${id}`);

  // Build human-readable diff
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined && current[k] !== v) {
      // Truncate long scripts in the diff preview
      const from =
        typeof current[k] === "string" && (current[k] as string).length > 120
          ? (current[k] as string).slice(0, 120) + "…"
          : current[k];
      const to =
        typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "…" : v;
      diff[k] = { from, to };
    }
  }

  if (Object.keys(diff).length === 0) {
    return { message: "No changes detected.", diff: {} };
  }

  if (!confirm) {
    return {
      message: "Dry run — pass confirm: true to apply.",
      checkId: id,
      checkName: current.name,
      diff,
    };
  }

  // Checkly PUT requires the full object — merge updates into current
  const payload: Check = { ...current, ...updates };
  const updated = await api.put<Check>(config, `/v1/checks/${id}`, payload);

  return {
    message: "Check updated successfully.",
    checkId: updated.id,
    checkName: updated.name,
    diff,
    updatedAt: updated.updatedAt,
  };
}

export async function runCheck(
  config: ChecklyConfig,
  id: string,
  awaitResult: boolean = false
) {
  if (config.readOnly) {
    return {
      error:
        "Server is in read-only mode. Set CHECKLY_READ_ONLY=false to enable writes.",
    };
  }

  // POST /v1/check-sessions/trigger with target.checkId
  // Returns 201 with sessions array. Requires check to be activated and in an active group.
  // If check inherits locations from a deactivated group, returns 404 "No matching checks were found".
  const response = await api.post<{ sessions: CheckSession[] }>(
    config,
    "/v1/check-sessions/trigger",
    { target: { checkId: [id] } }
  );

  const sessions = response.sessions ?? [];
  if (sessions.length === 0) {
    return {
      error:
        "Check was not triggered. It may be deactivated or belong to an inactive check group.",
      checkId: id,
    };
  }

  const session = sessions[0];

  if (!awaitResult) {
    return {
      message: "Check triggered.",
      checkId: session.checkId,
      checkName: session.name,
      sessionId: session.checkSessionId,
      status: session.status,
      runLocations: session.runLocations,
      startedAt: session.startedAt,
      checkSessionLink: session.checkSessionLink,
      hint: "Poll with get_session_status(sessionId) or wait and call get_check_results(checkId).",
    };
  }

  // Poll for completion (up to 120s, 3s intervals)
  const sessionId = session.checkSessionId;
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const polled = await api.get<CheckSession>(
      config,
      `/v1/check-sessions/${sessionId}`
    );
    if (polled.status !== "PROGRESS") {
      return {
        message: `Check completed: ${polled.status}`,
        checkId: polled.checkId,
        checkName: polled.name,
        sessionId: polled.checkSessionId,
        status: polled.status,
        runLocations: polled.runLocations,
        startedAt: polled.startedAt,
        stoppedAt: polled.stoppedAt,
        timeElapsedMs: polled.timeElapsed,
        checkSessionLink: polled.checkSessionLink,
        results: polled.results ?? [],
      };
    }
  }

  return {
    message: "Timed out waiting for check to complete (120s).",
    sessionId,
    checkSessionLink: session.checkSessionLink,
    hint: "Check is still running. Use checkSessionLink to view in Checkly UI.",
  };
}

export async function getCheckResults(
  config: ChecklyConfig,
  id: string,
  limit: number = 5
) {
  const results = await api.get<CheckResult[]>(
    config,
    `/v1/check-results/${id}?limit=${Math.min(limit, 100)}`
  );

  return results.map((r) => ({
    id: r.id,
    runLocation: r.runLocation,
    startedAt: r.startedAt,
    stoppedAt: r.stoppedAt,
    responseTimeMs: r.responseTime,
    passed: !r.hasFailures && !r.hasErrors,
    degraded: r.isDegraded,
    overMaxResponseTime: r.overMaxResponseTime,
    hasFailures: r.hasFailures,
    hasErrors: r.hasErrors,
  }));
}
