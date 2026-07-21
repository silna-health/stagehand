/**
 * ZDR (Zero Data Retention) test for the OpenAI CUA client with gpt-5.6-luna.
 *
 * Run this with OPENAI_API_KEY set to the ZDR-enabled org/project key (the one
 * that fails in production).
 *
 *   Control (reproduce the bug — stateful, uses previous_response_id):
 *     pnpm --filter @browserbasehq/stagehand example zdr-cua-test
 *
 *   Fix (stateless / ZDR-safe — store:false):
 *     STORE=false pnpm --filter @browserbasehq/stagehand example zdr-cua-test
 *
 * Expected:
 *   - Control run  -> fails: OpenAI rejects previous_response_id under ZDR.
 *   - STORE=false  -> completes the multi-step task with no ZDR error and no
 *     400 (watch the logs for any reasoning-item ordering / 400 error on a
 *     multi-step turn — that's the one edge worth confirming).
 */
import { Stagehand } from "../lib/v3/index.js";
import chalk from "chalk";

async function main() {
  const store = process.env.STORE === "false" ? false : undefined;
  const mode =
    store === false
      ? "STATELESS (store:false, ZDR-safe)"
      : "STATEFUL (default)";
  console.log(
    `\n${chalk.bold("Stagehand 🤘 gpt-5.6-luna ZDR test")} — ${mode}\n`,
  );

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 2,
  });
  await stagehand.init();

  try {
    const page = stagehand.context.pages()[0];

    const agent = stagehand.agent({
      mode: "cua",
      model: {
        modelName: "openai/gpt-5.6-luna",
        apiKey: process.env.OPENAI_API_KEY,
        // `store: false` is the ZDR switch. Omitted -> default stateful path.
        ...(store === false ? { store: false } : {}),
      },
      systemPrompt: `You are a helpful assistant that can use a web browser.
      Do not ask follow up questions, the user will trust your judgement.
      Today's date is ${new Date().toLocaleDateString()}.`,
    });

    await page.goto("https://news.ycombinator.com");

    // A deliberately multi-step task so the run spans several CUA turns —
    // this is what exercises cross-step context (previous_response_id vs.
    // resent history) and the reasoning-item ordering under ZDR.
    const instruction =
      "Find the top story, click into it, then go back and click into the second story. Tell me both titles.";
    console.log(`Instruction: ${chalk.white(instruction)}`);

    const result = await agent.execute({
      instruction,
      maxSteps: 15,
    });

    console.log(`\n${chalk.green("✓")} Done (${mode})`);
    console.log(`${chalk.yellow("⤷")} ${result.message}`);
  } catch (error) {
    console.error(`\n${chalk.red("✗")} Error (${mode}):`, error);
    if (error instanceof Error && error.stack) {
      console.log(chalk.dim(error.stack.split("\n").slice(1, 6).join("\n")));
    }
  } finally {
    await stagehand.close();
  }
}

main();
