import { describe, expect, it, vi } from "vitest";
import { OpenAICUAClient } from "../../lib/v3/agent/OpenAICUAClient.js";

function createClient() {
  return new OpenAICUAClient(
    "openai",
    "computer-use-preview-2025-03-11",
    undefined,
    { apiKey: "test-key" },
  );
}

describe("OpenAICUAClient", () => {
  it("exposes captchaSolvedProceed tool after a captcha context note", () => {
    const client = createClient();

    // Before captcha note — tool should not be active
    expect(
      (client as unknown as { captchaSolvedToolActive: boolean })
        .captchaSolvedToolActive,
    ).toBe(false);

    // Simulate a captcha context note being added (as the CUA handler does)
    client.addContextNote(
      "A captcha was automatically detected and solved — no further interaction needed.",
    );

    expect(
      (client as unknown as { captchaSolvedToolActive: boolean })
        .captchaSolvedToolActive,
    ).toBe(true);
  });

  it("does NOT activate captcha tool for non-captcha context notes", () => {
    const client = createClient();

    client.addContextNote("The page has finished loading.");

    expect(
      (client as unknown as { captchaSolvedToolActive: boolean })
        .captchaSolvedToolActive,
    ).toBe(false);
  });

  it("deactivates captcha tool after takeAction handles the function call", async () => {
    const client = createClient();
    client.addContextNote("A captcha was solved.");

    expect(
      (client as unknown as { captchaSolvedToolActive: boolean })
        .captchaSolvedToolActive,
    ).toBe(true);

    // Simulate the model calling the captchaSolvedProceed tool
    const result = await (
      client as unknown as {
        takeAction: (
          output: unknown[],
          logger: (msg: unknown) => void,
        ) => Promise<unknown[]>;
      }
    ).takeAction(
      [
        {
          type: "function_call",
          name: "captchaSolvedProceed",
          call_id: "call-1",
          arguments: "{}",
        },
      ],
      vi.fn(),
    );

    // Tool should be deactivated
    expect(
      (client as unknown as { captchaSolvedToolActive: boolean })
        .captchaSolvedToolActive,
    ).toBe(false);

    // Result should contain a function_call_output confirming proceed
    expect(result).toEqual([
      {
        type: "function_call_output",
        call_id: "call-1",
        output: expect.stringContaining("Continue completing"),
      },
    ]);
  });

  it("does NOT auto-continue follow-up questions without a captcha context", async () => {
    const client = createClient();
    // No captcha context note — no tool should be exposed

    type ExecuteStepResult = {
      actions: Array<{ type: string }>;
      message: string;
      completed: boolean;
      nextInputItems: unknown[];
      responseId: string;
      usage: {
        input_tokens: number;
        output_tokens: number;
        inference_time_ms: number;
      };
    };

    const executeStepSpy = vi.spyOn(
      client as unknown as {
        executeStep: (
          inputItems: unknown[],
          previousResponseId: string | undefined,
          logger: (message: { message: string }) => void,
        ) => Promise<ExecuteStepResult>;
      },
      "executeStep",
    );

    executeStepSpy.mockResolvedValueOnce({
      actions: [],
      message:
        "I've located the Submit button. Should I go ahead and submit it?",
      completed: true,
      nextInputItems: [],
      responseId: "response-1",
      usage: { input_tokens: 1, output_tokens: 1, inference_time_ms: 1 },
    });

    const result = await client.execute({
      options: { instruction: "Submit the form.", maxSteps: 10 } as never,
      logger: vi.fn(),
    });

    // Should NOT have continued — the model's follow-up is treated as completion
    expect(executeStepSpy).toHaveBeenCalledTimes(1);
    expect(result.completed).toBe(true);
  });
});

describe("OpenAICUAClient store / ZDR handling", () => {
  function createClientWithMockedResponses(store?: boolean) {
    const client = new OpenAICUAClient("openai", "gpt-5.6-luna", undefined, {
      apiKey: "test-key",
      ...(store === undefined ? {} : { store }),
    });

    const createMock = vi.fn().mockResolvedValue({
      id: "resp_new",
      output: [
        { type: "message", content: [{ type: "output_text", text: "done" }] },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    (
      client as unknown as {
        client: { responses: { create: typeof createMock } };
      }
    ).client = { responses: { create: createMock } };

    const getAction = (
      client as unknown as {
        getAction: (
          inputItems: unknown[],
          previousResponseId?: string,
        ) => Promise<unknown>;
      }
    ).getAction.bind(client);

    return { getAction, createMock };
  }

  it("runs the Responses API statelessly when store:false (ZDR org)", async () => {
    const { getAction, createMock } = createClientWithMockedResponses(false);

    await getAction([{ role: "user", content: "hi" }], "resp_prev");

    const params = createMock.mock.calls[0][0] as Record<string, unknown>;
    expect(params.store).toBe(false);
    expect(params.include).toContain("reasoning.encrypted_content");
    // No stored response to reference in stateless mode.
    expect(params.previous_response_id).toBeUndefined();
  });

  it("uses previous_response_id and omits store in default (stateful) mode", async () => {
    const { getAction, createMock } =
      createClientWithMockedResponses(undefined);

    await getAction([{ role: "user", content: "hi" }], "resp_prev");

    const params = createMock.mock.calls[0][0] as Record<string, unknown>;
    expect(params.previous_response_id).toBe("resp_prev");
    expect(params.store).toBeUndefined();
    expect(params.include).toBeUndefined();
  });
});

describe("OpenAICUAClient reasoning summary", () => {
  function createClientWithMockedOutput(output: unknown[]) {
    const client = new OpenAICUAClient("openai", "gpt-5.6-luna", undefined, {
      apiKey: "test-key",
    });

    const createMock = vi.fn().mockResolvedValue({
      id: "resp_new",
      output,
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    (
      client as unknown as {
        client: { responses: { create: typeof createMock } };
      }
    ).client = { responses: { create: createMock } };

    return { client, createMock };
  }

  it("requests reasoning.summary for gpt-5.x CUA models", async () => {
    const { client, createMock } = createClientWithMockedOutput([
      { type: "message", content: [{ type: "output_text", text: "done" }] },
    ]);

    const getAction = (
      client as unknown as {
        getAction: (
          inputItems: unknown[],
          previousResponseId?: string,
        ) => Promise<unknown>;
      }
    ).getAction.bind(client);

    await getAction([{ role: "user", content: "hi" }]);

    const params = createMock.mock.calls[0][0] as Record<string, unknown>;
    expect(params.reasoning).toEqual({ summary: "auto" });
  });

  it("falls back to the reasoning summary when the model emits no message item", async () => {
    const { client } = createClientWithMockedOutput([
      {
        type: "reasoning",
        id: "reasoning-1",
        summary: [
          {
            type: "summary_text",
            text: "Clicked the Sign In button; now on the 2-Step Authentication screen.",
          },
        ],
      },
    ]);

    const executeStep = (
      client as unknown as {
        executeStep: (
          inputItems: unknown[],
          previousResponseId: string | undefined,
          logger: (message: unknown) => void,
        ) => Promise<{ message: string }>;
      }
    ).executeStep.bind(client);

    const result = await executeStep(
      [{ role: "user", content: "hi" }],
      undefined,
      vi.fn(),
    );

    expect(result.message).toBe(
      "Clicked the Sign In button; now on the 2-Step Authentication screen.",
    );
  });

  it("combines the reasoning summary with the message item's text when both are present", async () => {
    const { client } = createClientWithMockedOutput([
      {
        type: "reasoning",
        id: "reasoning-1",
        summary: [{ type: "summary_text", text: "Thinking about next step." }],
      },
      {
        type: "message",
        content: [{ type: "output_text", text: "Clicked Sign In." }],
      },
    ]);

    const executeStep = (
      client as unknown as {
        executeStep: (
          inputItems: unknown[],
          previousResponseId: string | undefined,
          logger: (message: unknown) => void,
        ) => Promise<{ message: string }>;
      }
    ).executeStep.bind(client);

    const result = await executeStep(
      [{ role: "user", content: "hi" }],
      undefined,
      vi.fn(),
    );

    expect(result.message).toBe(
      "Thinking about next step.\n\nClicked Sign In.",
    );
  });

  it("surfaces the reasoning summary even when the model's message is a terse completion phrase", async () => {
    // Reproduces the reported regression: GPT-5.x often emits a bare "Done."
    // message alongside a detailed reasoning summary. An either/or fallback
    // (message || reasoning) would pick "Done." and drop the detail, since
    // "Done." is non-empty.
    const { client } = createClientWithMockedOutput([
      {
        type: "reasoning",
        id: "reasoning-1",
        summary: [
          {
            type: "summary_text",
            text: "Clicked the Sign In button; now on the 2-Step Authentication screen.",
          },
        ],
      },
      {
        type: "message",
        content: [{ type: "output_text", text: "Done." }],
      },
    ]);

    const executeStep = (
      client as unknown as {
        executeStep: (
          inputItems: unknown[],
          previousResponseId: string | undefined,
          logger: (message: unknown) => void,
        ) => Promise<{ message: string }>;
      }
    ).executeStep.bind(client);

    const result = await executeStep(
      [{ role: "user", content: "hi" }],
      undefined,
      vi.fn(),
    );

    expect(result.message).toBe(
      "Clicked the Sign In button; now on the 2-Step Authentication screen.\n\nDone.",
    );
  });
});
