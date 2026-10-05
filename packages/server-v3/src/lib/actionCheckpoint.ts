import type { AgentExecuteCallbacks } from "@browserbasehq/stagehand/lib/v3/types/public/agent.js";

export function createActionCheckpoint(
  endpoint: string,
): NonNullable<AgentExecuteCallbacks["onActionCheckpoint"]> {
  const url = new URL(endpoint);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error("Action checkpoint must use a loopback HTTP endpoint");
  }
  return async (event) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phase: event.phase,
        actionType: event.action?.type,
      }),
      signal: AbortSignal.timeout(45_000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(
        `Action checkpoint unavailable (HTTP ${response.status})`,
      );
    const verdict: unknown = await response.json();
    if (
      typeof verdict !== "object" ||
      verdict === null ||
      !("proceed" in verdict) ||
      typeof verdict.proceed !== "boolean"
    ) {
      throw new Error("Invalid action checkpoint response");
    }
    return {
      proceed: verdict.proceed,
      reason:
        "reason" in verdict && typeof verdict.reason === "string"
          ? verdict.reason
          : undefined,
    };
  };
}
