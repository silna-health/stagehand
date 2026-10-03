import { describe, expect, it, vi } from "vitest";
import { AnthropicCUAClient } from "../../lib/v3/agent/AnthropicCUAClient.js";
import { OpenAICUAClient } from "../../lib/v3/agent/OpenAICUAClient.js";
import { GoogleCUAClient } from "../../lib/v3/agent/GoogleCUAClient.js";
import { MicrosoftCUAClient } from "../../lib/v3/agent/MicrosoftCUAClient.js";
import { AgentActionInterruptedError } from "../../lib/v3/agent/utils/actionCheckpoint.js";

describe("provider interruption propagation", () => {
  const providers = [
    ["anthropic", AnthropicCUAClient, "claude-sonnet-4-6"],
    ["openai", OpenAICUAClient, "gpt-5.4"],
    ["google", GoogleCUAClient, "gemini-2.5-computer-use-preview-10-2025"],
    ["microsoft", MicrosoftCUAClient, "fara-7b"],
  ] as const;
  it.each(providers)(
    "%s does not swallow action interruptions",
    async (provider, Client, model) => {
      const client = new Client(provider, model, undefined, {
        apiKey: "test-key",
        baseURL: "http://127.0.0.1:1234",
      });
      vi.spyOn(
        client as unknown as { executeStep: () => Promise<unknown> },
        "executeStep",
      ).mockRejectedValue(new AgentActionInterruptedError("SUBMISSION_GUARD"));

      await expect(
        client.execute({
          options: { instruction: "Submit", maxSteps: 1 },
          logger: () => {},
        }),
      ).rejects.toThrow(AgentActionInterruptedError);
    },
  );
});

describe("OpenAI computer action batches", () => {
  it("does not execute the next action or take another screenshot after interruption", async () => {
    const client = new OpenAICUAClient("openai", "gpt-5.4", undefined, {
      apiKey: "test-key",
    });
    const performAction = vi.fn(async () => {
      throw new AgentActionInterruptedError("SUBMISSION_GUARD");
    });
    client.setActionHandler(performAction);
    const screenshot = vi
      .spyOn(client, "captureScreenshot")
      .mockResolvedValue({ base64: "fake-image", mediaType: "image/png" });
    const batch = [
      {
        type: "computer_call",
        call_id: "submit-and-followup",
        actions: [
          { type: "click", x: 10, y: 20, button: "left" },
          { type: "click", x: 30, y: 40, button: "left" },
        ],
      },
    ];

    await expect(client.takeAction(batch as never, () => {})).rejects.toThrow(
      AgentActionInterruptedError,
    );

    expect(performAction).toHaveBeenCalledTimes(1);
    expect(performAction).toHaveBeenCalledWith(
      expect.objectContaining({ x: 10, y: 20 }),
    );
    expect(screenshot).not.toHaveBeenCalled();
  });
});
