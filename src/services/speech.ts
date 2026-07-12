const MAX_SPEECH_LENGTH = 700;

// Wraps speech in an Amazon Polly voice so Atlas sounds distinct from the
// device's default Alexa voice. The voice matching the locale comes from
// the messages module (pt-BR: Ricardo, en-US: Matthew).
export function atlasVoice(text: string, voiceName: string): string {
  return `<voice name="${voiceName}">${text}</voice>`;
}

/**
 * Prepares LLM output to be spoken by Alexa: strips markdown, collapses
 * whitespace, truncates to a speakable length and escapes SSML characters.
 */
export function sanitizeForSpeech(text: string): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/【[^】]*】/g, "")
    .replace(/\(\s*(?:[\w-]+\.)+[a-z]{2,}[^)]*\)/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#>~|]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;!?])/g, "$1")
    .trim();

  return escapeSsml(truncate(plain, MAX_SPEECH_LENGTH));
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const slice = text.slice(0, maxLength);
  const lastSentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? ")
  );

  // Prefer cutting at a sentence boundary so the speech does not stop mid-word.
  if (lastSentenceEnd > maxLength * 0.5) {
    return slice.slice(0, lastSentenceEnd + 1);
  }

  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : maxLength)}...`;
}

function escapeSsml(text: string): string {
  return text.replace(/&/g, " e ").replace(/[<>"]/g, "");
}
