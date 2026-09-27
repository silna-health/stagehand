/**
 * GPT-6 Luna smoke test: a one-shot API ping, then a multi-step CUA run.
 *
 *   pnpm --filter @browserbasehq/stagehand example gpt6-luna-cua-example
 *
 * Set PING_ONLY=true to skip the browser run. Set STORE=false for Zero Data
 * Retention (ZDR) orgs, which reject `previous_response_id`.
 */
import { Stagehand } from "../lib/v3/index.js";
import chalk from "chalk";

const MODEL = "gpt-6-luna";

async function ping() {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, input: "Reply with just: pong" }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `Ping failed (${response.status}): ${JSON.stringify(body)}`,
    );
  }
  const text = body.output
    ?.flatMap((item: { content?: { text?: string }[] }) => item.content ?? [])
    .map((part: { text?: string }) => part.text)
    .filter(Boolean)
    .join("");
  console.log(
    `${chalk.green("✓")} Ping ok — model=${body.model} output=${JSON.stringify(text)}`,
  );
}

async function main() {
  console.log(`\n${chalk.bold("Stagehand 🤘 GPT-6 Luna CUA Demo")}\n`);

  await ping();
  if (process.env.PING_ONLY === "true") return;

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
        modelName: `openai/${MODEL}`,
        apiKey: process.env.OPENAI_API_KEY,
        ...(process.env.STORE === "false" ? { store: false } : {}),
      },
      systemPrompt: `You are a helpful assistant that can use a web browser.
      Do not ask follow up questions, the user will trust your judgement.
      Today's date is ${new Date().toLocaleDateString()}.`,
    });

    await page.goto("https://news.ycombinator.com");

    const instruction =
      "Find the top story, click into it, then go back and click into the second story. Tell me both titles.";
    console.log(`Instruction: ${chalk.white(instruction)}`);

    const result = await agent.execute({
      instruction,
      maxSteps: 15,
    });

    console.log(`\n${chalk.green("✓")} Done`);
    console.log(`${chalk.yellow("⤷")} ${result.message}`);
  } catch (error) {
    console.error(`${chalk.red("✗")} Error:`, error);
  } finally {
    await stagehand.close();
  }
}

main();
