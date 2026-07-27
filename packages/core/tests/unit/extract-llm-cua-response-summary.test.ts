import { describe, expect, it } from "vitest";
import { extractLlmCuaResponseSummary } from "../../lib/v3/flowlogger/FlowLogger.js";

describe("extractLlmCuaResponseSummary", () => {
  it("captures Anthropic's flat text blocks verbatim", () => {
    const summary = extractLlmCuaResponseSummary([
      { type: "text", text: "Clicked the Sign In button." },
      { type: "tool_use", name: "computer" },
    ]);

    expect(summary).toBe("Clicked the Sign In button. computer");
  });

  it("captures OpenAI message output_text instead of falling back to the type token", () => {
    const summary = extractLlmCuaResponseSummary([
      {
        type: "message",
        content: [{ type: "output_text", text: "Clicked Sign In." }],
      },
    ]);

    expect(summary).toBe("Clicked Sign In.");
  });

  it("captures OpenAI reasoning summary text instead of falling back to the type token", () => {
    const summary = extractLlmCuaResponseSummary([
      {
        type: "reasoning",
        summary: [{ type: "summary_text", text: "Deciding next step." }],
      },
    ]);

    expect(summary).toBe("Deciding next step.");
  });

  it("falls back to the function name for OpenAI function_call items", () => {
    const summary = extractLlmCuaResponseSummary([
      { type: "function_call", name: "do_multistep_browser_action" },
    ]);

    expect(summary).toBe("do_multistep_browser_action");
  });

  it("falls back to the bare type token for unrecognized item shapes", () => {
    const summary = extractLlmCuaResponseSummary([
      { type: "computer_call", call_id: "call-1" },
    ]);

    expect(summary).toBe("computer_call");
  });
});
