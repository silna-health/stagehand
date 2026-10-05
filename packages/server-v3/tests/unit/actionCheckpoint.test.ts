import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { createActionCheckpoint } from "../../src/lib/actionCheckpoint.js";

describe("action checkpoint bridge", () => {
  afterEach(() => mock.restoreAll());

  it("rejects remote endpoints", () => {
    assert.throws(
      () => createActionCheckpoint("http://portal.example.com/checkpoint"),
      /loopback/,
    );
  });

  it("forwards the action phase and returns the held verdict", async () => {
    const fetch = mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ proceed: false, reason: "SUBMISSION_GUARD" }),
        ),
    );
    const checkpoint = createActionCheckpoint(
      "http://127.0.0.1:1234/checkpoint/token",
    );

    const result = await checkpoint({
      phase: "after_action",
      action: { type: "click" },
    });

    assert.deepEqual(result, { proceed: false, reason: "SUBMISSION_GUARD" });
    assert.equal(fetch.mock.calls.length, 1);
    assert.deepEqual(
      JSON.parse(String(fetch.mock.calls[0].arguments[1]?.body)),
      { phase: "after_action", actionType: "click" },
    );
  });

  it("rejects unavailable checkpoints", async () => {
    mock.method(
      globalThis,
      "fetch",
      async () => new Response("unavailable", { status: 503 }),
    );
    const checkpoint = createActionCheckpoint(
      "http://127.0.0.1:1234/checkpoint/token",
    );

    await assert.rejects(checkpoint({ phase: "before_step" }), /unavailable/);
  });

  it("rejects malformed verdicts", async () => {
    mock.method(
      globalThis,
      "fetch",
      async () => new Response(JSON.stringify({ proceed: "true" })),
    );
    const checkpoint = createActionCheckpoint(
      "http://127.0.0.1:1234/checkpoint/token",
    );

    await assert.rejects(checkpoint({ phase: "before_step" }), /Invalid/);
  });
});
