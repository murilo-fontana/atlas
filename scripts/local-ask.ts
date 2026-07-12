import { askOpenAI } from "../src/services/openaiClient";
import { sanitizeForSpeech } from "../src/services/speech";

async function main(): Promise<void> {
  const question = process.argv.slice(2).join(" ").trim();

  if (question === "") {
    console.error("usage: npm run ask -- <question>");
    process.exit(1);
  }

  const startedAt = Date.now();
  const answer = await askOpenAI(question);
  const elapsedMs = Date.now() - startedAt;
  const speech = sanitizeForSpeech(answer.speech);

  console.log(`🟢 answered in ${elapsedMs}ms (${speech.length} chars):\n`);
  console.log(speech);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`🟥 failed: ${message}`);
  process.exit(1);
});
