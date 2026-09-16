export const TTL = {
  MAP: 60 * 60 * 6,
  SCRAPE_VOLATILE: 60 * 15,
  SCRAPE_STABLE: 60 * 60 * 24,
  SEARCH: 60 * 20,
  AGENT_RESULT: 60 * 45,
};

export function classifyFreshness(url: string): "volatile" | "stable" {
  const volatilePatterns = [/news\./i, /reddit\.com/i, /twitter\.com|x\.com/i, /price|pricing|stock|market/i, /\/blog\//i];
  const stablePatterns = [/docs\./i, /documentation/i, /\/api-reference\//i, /wikipedia\.org/i, /github\.com.*\/(blob|tree)\//i];
  if (stablePatterns.some((pattern) => pattern.test(url))) return "stable";
  if (volatilePatterns.some((pattern) => pattern.test(url))) return "volatile";
  return "volatile";
}
