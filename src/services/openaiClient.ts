import OpenAI from "openai";

// The owner's name comes from the environment so no personal data lives in
// the source code.
const OWNER_NAME = process.env.OWNER_NAME ?? "your user";

const SYSTEM_PROMPT =
  `You are Atlas, ${OWNER_NAME}'s voice assistant inside Alexa. ` +
  "Answer in Portuguese by default unless the user asks in another language. " +
  "Answer ONLY what was asked, in at most 3 short spoken sentences (about 50 words). " +
  "Never offer additional help, never ask 'quer que eu...', never suggest follow-ups, never add caveats or background unless essential to the answer. " +
  "Only ask a clarifying question when the request is truly impossible to answer without it, " +
  "and when you do, the clarifying question must be the last sentence of your answer. " +
  "Do not use markdown. " +
  "Use web search when the question involves current events, live data, or anything after your knowledge cutoff. " +
  "Never read URLs or citations aloud.";

const DEFAULT_MODEL = "gpt-5-nano";

// Needs room for reasoning + search handling + the spoken answer.
const MAX_OUTPUT_TOKENS = 1200;

// Alexa aborts the request after ~8s, so the OpenAI call must finish before that.
const DEFAULT_TIMEOUT_MS = 7000;

function requestTimeoutMs(): number {
  const override = Number(process.env.OPENAI_TIMEOUT_MS);
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_TIMEOUT_MS;
}

// Lazy init so a missing OPENAI_API_KEY surfaces as a handled error inside
// the skill's ErrorHandler instead of crashing the Lambda cold start.
let client: OpenAI | undefined;

function getClient(): OpenAI {
  if (client === undefined) {
    client = new OpenAI({
      timeout: requestTimeoutMs(),
      maxRetries: 0,
    });
  }
  return client;
}

export interface Answer {
  speech: string;
  responseId: string;
}

/**
 * Asks the model a question. Passing the responseId of the previous answer
 * chains the calls, giving the model the conversation context of the current
 * Alexa session.
 */
export async function askOpenAI(question: string, previousResponseId?: string): Promise<Answer> {
  const response = await getClient().responses.create({
    model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
    instructions: SYSTEM_PROMPT,
    input: question,
    previous_response_id: previousResponseId,
    truncation: "auto",
    max_output_tokens: MAX_OUTPUT_TOKENS,
    // "minimal" effort does not support the web_search tool, so use "low".
    reasoning: { effort: "low" },
    text: { verbosity: "low" },
    tools: [{ type: "web_search", search_context_size: "low" }],
  });

  const speech = response.output_text.trim();

  if (speech === "") {
    throw new Error("empty response from model");
  }

  return { speech, responseId: response.id };
}

/**
 * True when the failure was caused by a stale previous_response_id (OpenAI
 * retains responses for ~30 days). The caller should retry without context.
 */
export function isStaleContextError(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError)) {
    return false;
  }
  const isClientError = error.status === 400 || error.status === 404;
  return isClientError && /previous.?response/i.test(error.message);
}

/** True when the model did not answer within the Alexa time budget. */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof OpenAI.APIConnectionTimeoutError;
}
