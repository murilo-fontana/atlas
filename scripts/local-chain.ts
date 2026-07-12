import { askOpenAI } from "../src/services/openaiClient";

async function main(): Promise<void> {
  const first = await askOpenAI("me fala sobre a austrália em uma frase");
  console.log("🟢 question 1:", first.speech, "\n");

  const second = await askOpenAI("e qual é a capital dela", first.responseId);
  console.log("🟢 question 2 (with context):", second.speech);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`🟥 failed: ${message}`);
  process.exit(1);
});
