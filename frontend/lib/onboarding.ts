const ONBOARDING_KEY = "TrueMemory-onboarding-complete";

export function hasCompletedOnboarding(userId: string) {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(`${ONBOARDING_KEY}:${userId}`) === "true";
}

export function completeOnboarding(userId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${ONBOARDING_KEY}:${userId}`, "true");
}
