/**
 * Everything Atlas says (outside of model answers) in each supported locale,
 * plus the Polly voice that matches the language.
 */
export interface LocaleMessages {
  voiceName: string;
  launch: string;
  reprompt: string;
  emptyQuestion: string;
  questionTooLong: string;
  forgotten: string;
  searchTimeout: string;
  help: string;
  goodbye: string;
  fallback: string;
  somethingWentWrong: string;
  filler: string;
  forgetPattern: RegExp;
}

const PT_BR: LocaleMessages = {
  voiceName: "Ricardo",
  launch: "Oi, aqui é o Atlas. O que você quer saber?",
  reprompt: "Pode fazer outra pergunta, ou dizer parar para sair.",
  emptyQuestion: "Não entendi a pergunta. Pode repetir?",
  questionTooLong: "Essa pergunta ficou longa demais. Tenta uma versão mais curta.",
  forgotten: "Prontinho, esqueci nossa conversa. Começamos do zero.",
  searchTimeout: "Essa busca está demorando mais que o normal. Pergunta de novo.",
  help: "Você pode me fazer qualquer pergunta. Por exemplo: pergunta o que é uma função lambda.",
  goodbye: "Até mais.",
  fallback: "Não entendi. Tenta começar com: pergunta, e depois o que você quer saber.",
  somethingWentWrong: "Desculpa, algo deu errado. Tenta de novo.",
  filler: "Deixa eu ver.",
  forgetPattern:
    /^(esquece|esqueça|esquecer|apaga|apague|apagar|limpa|limpe|limpar) (toda (a )?)?(tudo|a conversa|nossa conversa|a memória|sua memória|memória)$/i,
};

const EN_US: LocaleMessages = {
  voiceName: "Matthew",
  launch: "Hi, this is Atlas. What do you want to know?",
  reprompt: "You can ask another question, or say stop to leave.",
  emptyQuestion: "I didn't catch the question. Can you repeat it?",
  questionTooLong: "That question was too long. Try a shorter version.",
  forgotten: "Done, I forgot our conversation. We're starting fresh.",
  searchTimeout: "This search is taking longer than usual. Ask me again.",
  help: "You can ask me anything. For example: ask what a lambda function is.",
  goodbye: "See you later.",
  fallback: "I didn't get that. Try starting with: ask, followed by what you want to know.",
  somethingWentWrong: "Sorry, something went wrong. Try again.",
  filler: "Let me check.",
  forgetPattern:
    /^(forget|erase|clear|delete) (everything|it all|all of it|the conversation|our conversation|your memory|the memory|memory)$/i,
};

export function messagesForLocale(locale: string | undefined): LocaleMessages {
  return locale !== undefined && locale.startsWith("pt") ? PT_BR : EN_US;
}
