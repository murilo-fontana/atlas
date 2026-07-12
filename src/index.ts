import * as Alexa from "ask-sdk-core";
import type { IntentRequest } from "ask-sdk-model";
import {
  askOpenAI,
  isStaleContextError,
  isTimeoutError,
  type Answer,
} from "./services/openaiClient";
import { forgetConversation, loadLastResponseId, saveLastResponseId } from "./services/memory";
import { messagesForLocale, type LocaleMessages } from "./services/messages";
import { atlasVoice, sanitizeForSpeech } from "./services/speech";

const MAX_QUESTION_LENGTH = 500;

// Only play the filler when the answer is genuinely slow, and then hold the
// final response long enough for the filler to finish playing. If the final
// response reaches Alexa while the filler is still playing, some devices
// silently drop the final speech.
const PROGRESSIVE_AFTER_MS = 2500;
const PROGRESSIVE_PLAYBACK_MS = 2000;

function messagesFor(handlerInput: Alexa.HandlerInput): LocaleMessages {
  return messagesForLocale(Alexa.getLocale(handlerInput.requestEnvelope));
}

function say(messages: LocaleMessages, text: string): string {
  return atlasVoice(text, messages.voiceName);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Plays a short filler line while the OpenAI call is running.
 * Fire-and-forget: a failure here must never affect the answer.
 */
function sendProgressiveResponse(handlerInput: Alexa.HandlerInput, messages: LocaleMessages): void {
  const requestId = handlerInput.requestEnvelope.request.requestId;

  handlerInput.serviceClientFactory
    ?.getDirectiveServiceClient()
    .enqueue({
      header: { requestId },
      directive: {
        type: "VoicePlayer.Speak",
        speech: `<speak>${say(messages, messages.filler)}</speak>`,
      },
    })
    .catch(() => {
      // Progressive responses are best-effort.
    });
}

async function askWithProgressiveFiller(
  handlerInput: Alexa.HandlerInput,
  messages: LocaleMessages,
  question: string,
  previousResponseId?: string
): Promise<Answer> {
  const answerPromise = askOpenAI(question, previousResponseId);

  const isSlow = await Promise.race([
    answerPromise.then(() => false),
    delay(PROGRESSIVE_AFTER_MS).then(() => true),
  ]);

  if (!isSlow) {
    return answerPromise;
  }

  sendProgressiveResponse(handlerInput, messages);
  const [answer] = await Promise.all([answerPromise, delay(PROGRESSIVE_PLAYBACK_MS)]);
  return answer;
}

const LaunchRequestHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest";
  },
  handle(handlerInput) {
    const messages = messagesFor(handlerInput);
    return handlerInput.responseBuilder
      .speak(say(messages, messages.launch))
      .reprompt(say(messages, messages.reprompt))
      .getResponse();
  },
};

const AskIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AskIntent"
    );
  },
  async handle(handlerInput) {
    const messages = messagesFor(handlerInput);
    const reprompt = say(messages, messages.reprompt);
    const request = handlerInput.requestEnvelope.request as IntentRequest;
    const question = request.intent.slots?.question?.value;

    if (question === undefined || question.trim() === "") {
      return handlerInput.responseBuilder
        .speak(say(messages, messages.emptyQuestion))
        .reprompt(reprompt)
        .getResponse();
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      return handlerInput.responseBuilder
        .speak(say(messages, messages.questionTooLong))
        .reprompt(reprompt)
        .getResponse();
    }

    const userId = Alexa.getUserId(handlerInput.requestEnvelope);

    if (messages.forgetPattern.test(question.trim())) {
      await forgetConversation(userId);
      handlerInput.attributesManager.setSessionAttributes({});
      return handlerInput.responseBuilder
        .speak(say(messages, messages.forgotten))
        .withShouldEndSession(true)
        .getResponse();
    }

    // Conversation context: chain OpenAI responses via previous_response_id.
    // Within a session the id lives in session attributes; across sessions it
    // is loaded from DynamoDB, so Atlas remembers previous conversations.
    const attributes = handlerInput.attributesManager.getSessionAttributes();
    const previousResponseId =
      typeof attributes.lastResponseId === "string"
        ? attributes.lastResponseId
        : await loadLastResponseId(userId);

    let answer: Answer;
    try {
      answer = await askWithProgressiveFiller(handlerInput, messages, question, previousResponseId);
    } catch (error) {
      if (isTimeoutError(error)) {
        return handlerInput.responseBuilder
          .speak(say(messages, messages.searchTimeout))
          .reprompt(reprompt)
          .getResponse();
      }

      // The stored id expired on OpenAI's side: answer without context.
      if (previousResponseId !== undefined && isStaleContextError(error)) {
        answer = await askOpenAI(question);
      } else {
        throw error;
      }
    }

    attributes.lastResponseId = answer.responseId;
    handlerInput.attributesManager.setSessionAttributes(attributes);
    await saveLastResponseId(userId, answer.responseId);

    const speech = say(messages, sanitizeForSpeech(answer.speech));

    // One-shot ("alexa, ask atlas...") with a conclusive answer ends the
    // interaction. The mic stays open only when the model asked something
    // back (clarification) or when the user opened a conversation session
    // ("alexa, open atlas").
    const expectsReply = speech.includes("?");
    const isOneShot = Alexa.isNewSession(handlerInput.requestEnvelope);

    if (expectsReply || !isOneShot) {
      return handlerInput.responseBuilder.speak(speech).reprompt(reprompt).getResponse();
    }

    return handlerInput.responseBuilder.speak(speech).withShouldEndSession(true).getResponse();
  },
};

const HelpIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.HelpIntent"
    );
  },
  handle(handlerInput) {
    const messages = messagesFor(handlerInput);
    return handlerInput.responseBuilder
      .speak(say(messages, messages.help))
      .reprompt(say(messages, messages.reprompt))
      .getResponse();
  },
};

const CancelAndStopIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    if (Alexa.getRequestType(handlerInput.requestEnvelope) !== "IntentRequest") {
      return false;
    }
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    return intentName === "AMAZON.CancelIntent" || intentName === "AMAZON.StopIntent";
  },
  handle(handlerInput) {
    const messages = messagesFor(handlerInput);
    return handlerInput.responseBuilder.speak(say(messages, messages.goodbye)).getResponse();
  },
};

const FallbackIntentHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.FallbackIntent"
    );
  },
  handle(handlerInput) {
    const messages = messagesFor(handlerInput);
    return handlerInput.responseBuilder
      .speak(say(messages, messages.fallback))
      .reprompt(say(messages, messages.reprompt))
      .getResponse();
  },
};

const SessionEndedRequestHandler: Alexa.RequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === "SessionEndedRequest";
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler: Alexa.ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    // Log only the error message: never the API key, the full Alexa payload
    // or the full model response.
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`🟥 Atlas error: ${message}`);

    const messages = messagesFor(handlerInput);
    return handlerInput.responseBuilder
      .speak(say(messages, messages.somethingWentWrong))
      .reprompt(say(messages, messages.reprompt))
      .getResponse();
  },
};

// The skill id lives in the Lambda's environment (ALEXA_SKILL_ID) so it never
// appears in the source code. Without it the request-origin validation is
// skipped, so the variable must be set in production.
const skillId = process.env.ALEXA_SKILL_ID;

const skillBuilder = Alexa.SkillBuilders.custom();

if (skillId !== undefined && skillId !== "") {
  skillBuilder.withSkillId(skillId);
}

export const handler = skillBuilder
  .withApiClient(new Alexa.DefaultApiClient())
  .addRequestHandlers(
    LaunchRequestHandler,
    AskIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
