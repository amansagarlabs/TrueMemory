import assert from "node:assert/strict";
import test from "node:test";

// Node's type-stripping test runner requires the explicit extension.
// @ts-expect-error TypeScript resolves this correctly with noEmit enabled.
import { QUERY_ATTACHMENT_MAX_CHARACTERS, QUERY_PROMPT_CONTEXT_MAX_CHARACTERS, QUERY_QUESTION_MAX_CHARACTERS, prepareQueryInput } from "./query-input.ts";

test("keeps normal questions unchanged", () => {
  assert.deepEqual(prepareQueryInput("  Explain this file.  "), {
    question: "Explain this file.",
    promptContext: undefined,
    attachmentContext: undefined,
    overflowed: false,
  });
});

test("moves long prompt overflow into trusted prompt context", () => {
  const result = prepareQueryInput(
    "q".repeat(QUERY_QUESTION_MAX_CHARACTERS + 25),
    "Active file: README.md",
  );

  assert.equal(result.question.length, QUERY_QUESTION_MAX_CHARACTERS);
  assert.equal(result.overflowed, true);
  assert.equal(result.attachmentContext, "Active file: README.md");
  assert.equal(result.promptContext, "q".repeat(25));
});

test("bounds structured context without splitting Unicode characters", () => {
  const result = prepareQueryInput(
    "Explain the workspace.",
    "🙂".repeat(QUERY_ATTACHMENT_MAX_CHARACTERS + 10),
  );

  assert.equal(
    Array.from(result.attachmentContext || "").length,
    QUERY_ATTACHMENT_MAX_CHARACTERS,
  );
  assert.equal(result.attachmentContext?.endsWith("🙂"), true);
});

test("rejects an empty question before making a request", () => {
  assert.throws(
    () => prepareQueryInput("   "),
    /Enter a question before starting the agent/,
  );
});

test("rejects prompts above the combined instruction budget", () => {
  assert.throws(
    () =>
      prepareQueryInput(
        "q".repeat(
          QUERY_QUESTION_MAX_CHARACTERS +
            QUERY_PROMPT_CONTEXT_MAX_CHARACTERS +
            1,
        ),
      ),
    /prompt exceeds 20,000 characters/,
  );
});
