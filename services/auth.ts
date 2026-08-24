import type { AuthSession, AuthUser } from "@/lib/types";
import { buildAuthHeaders, credentialedFetch } from "@/lib/auth";
import { API_URL } from "@/services/api";

type AuthResponse = {
  user: AuthUser;
  session: AuthSession;
};

function throwConnectionError(error: unknown): never {
  if (error instanceof TypeError && /fetch|network|connection/i.test(error.message)) {
    throw new Error(
      "TrueMemory backend is unavailable. Start the backend service, then try again.",
    );
  }
  throw error;
}

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  username?: string;
  full_name?: string;
}): Promise<AuthResponse> {
  let res: Response;
  try {
    res = await credentialedFetch(`${API_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (error) {
    throwConnectionError(error);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : `Signup failed (${res.status})`,
    );
  }
  return data as AuthResponse;
}

export async function loginWithEmail(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  let res: Response;
  try {
    res = await credentialedFetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (error) {
    throwConnectionError(error);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : `Login failed (${res.status})`,
    );
  }
  return data as AuthResponse;
}

export async function fetchMe(token?: string): Promise<{ user: AuthUser }> {
  let res: Response;
  try {
    res = await credentialedFetch(`${API_URL}/api/auth/me`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
    });
  } catch (error) {
    throwConnectionError(error);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : `Profile failed (${res.status})`,
    );
  }
  return data as { user: AuthUser };
}

export async function updateProfile(input: {
  full_name?: string;
  username?: string;
  bio?: string;
  company?: string;
  location?: string;
  website?: string;
  onboarding_persona?: string;
  onboarding_heard_about?: string;
  onboarding_use_case?: string;
  onboarding_workspace_name?: string;
  onboarding_step?: string;
}): Promise<AuthUser> {
  const res = await credentialedFetch(`${API_URL}/api/auth/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : `Profile update failed (${res.status})`,
    );
  }
  return data.user as AuthUser;
}
