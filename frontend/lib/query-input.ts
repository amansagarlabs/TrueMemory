export const QUERY_QUESTION_MAX_CHARACTERS = 4_000;
export const QUERY_PROMPT_CONTEXT_MAX_CHARACTERS = 16_000;
export const QUERY_ATTACHMENT_MAX_CHARACTERS = 60_000;

export type PreparedQueryInput = {
  question: string;
  promptContext?: string;
  attachmentContext?: string;
  overflowed: boolean;
};

function takeCharacters(value: string, limit: number) {
  return Array.from(value).slice(0, limit).join("");
}

export function prepareQueryInput(
  question: string,
  attachmentContext?: string,
): PreparedQueryInput {
  const normalizedQuestion = question.trim();
  if (!normalizedQuestion) {
    throw new Error("Enter a question before starting the agent.");
  }

  const questionCharacters = Array.from(normalizedQuestion);
  const overflowed =
    questionCharacters.length > QUERY_QUESTION_MAX_CHARACTERS;
  const boundedQuestion = questionCharacters
    .slice(0, QUERY_QUESTION_MAX_CHARACTERS)
    .join("");
  const overflow = overflowed
    ? questionCharacters.slice(QUERY_QUESTION_MAX_CHARACTERS).join("")
    : "";
  if (
    Array.from(overflow).length > QUERY_PROMPT_CONTEXT_MAX_CHARACTERS
  ) {
    throw new Error(
      "The prompt exceeds 20,000 characters. Attach large files as context instead.",
    );
  }
  const normalizedAttachmentContext = attachmentContext?.trim() || "";

  return {
    question: boundedQuestion,
    promptContext: overflow || undefined,
    attachmentContext: normalizedAttachmentContext
      ? takeCharacters(
          normalizedAttachmentContext,
          QUERY_ATTACHMENT_MAX_CHARACTERS,
        )
      : undefined,
    overflowed,
  };
}
