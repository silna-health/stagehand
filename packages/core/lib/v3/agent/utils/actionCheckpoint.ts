import type { AgentExecuteCallbacks } from "../../types/public/agent.js";

export class AgentActionInterruptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentActionInterruptedError";
  }
}

export async function checkAgentAction(
  checkpoint: AgentExecuteCallbacks["onActionCheckpoint"],
  event: Parameters<NonNullable<typeof checkpoint>>[0],
): Promise<void> {
  if (!checkpoint) return;
  let verdict: Awaited<ReturnType<NonNullable<typeof checkpoint>>>;
  try {
    verdict = await checkpoint(event);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AgentActionInterruptedError(
      `Action checkpoint unavailable: ${detail}`,
    );
  }
  if (verdict?.proceed !== true) {
    throw new AgentActionInterruptedError(
      verdict?.reason ?? "Execution paused by action checkpoint",
    );
  }
}
