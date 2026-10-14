export function getChatFailureMessage(errorMessage: string, isArtifactChat: boolean) {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("session expired") || normalized.includes("unauthenticated")) {
    return "Your TrueMemory session has expired. Sign out and sign in again, then retry your message.";
  }
  if (
    normalized.includes("no endpoints available matching your guardrail") ||
    normalized.includes("data policy")
  ) {
    return "OpenRouter blocked this request because your privacy or guardrail settings allow no eligible providers. Open OpenRouter Settings > Privacy and allow a compatible provider or disable the restrictive data-policy/ZDR rule, then retry.";
  }
  if (
    normalized.includes("provider returned error") ||
    normalized.includes("provider unavailable") ||
    normalized.includes("openrouter") ||
    normalized.includes("model") ||
    normalized.includes("gateway") ||
    normalized.includes("quota") ||
    normalized.includes("credit")
  ) {
    return "The provider returned an error while generating the answer. Try again, switch models, or check provider credits.";
  }
  if (
    normalized.includes("stream ended") ||
    normalized.includes("empty model response") ||
    normalized.includes("no text")
  ) {
    return "The answer stream ended early. Please retry the request.";
  }
  return isArtifactChat
    ? "I hit a backend issue while reading the artifact. Please try again."
    : "I hit a backend issue while answering. Please try again.";
}
