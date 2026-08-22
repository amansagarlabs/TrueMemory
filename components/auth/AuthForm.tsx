"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { saveAuthSession } from "@/lib/auth";
import { loginWithEmail, signUpWithEmail } from "@/services/auth";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Mode = "login" | "signup";
type FieldName = "fullName" | "email" | "password";

function AuthFormInner({ mode: initialMode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get("redirect");
  const redirectTo =
    requestedRedirect?.startsWith("/") && !requestedRedirect.startsWith("//")
      ? requestedRedirect
      : "/chat";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const toast = useToast();

  const isSignup = mode === "signup";
  const socialButtonClass =
    "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-border bg-background px-3.5 text-[13px] font-medium text-foreground/80 transition-[background-color,border-color,color,transform,box-shadow,opacity] duration-150 hover:-translate-y-px hover:border-border hover:bg-muted hover:text-foreground hover:shadow-[0_10px_24px_-18px_rgba(0,0,0,0.25)] active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/85 dark:hover:border-white/20 dark:hover:bg-white/[0.06] dark:hover:text-white dark:focus-visible:ring-[#f6e879]/50";

  function showValidationToast(title: string, description: string) {
    toast.error(title, {
      description,
      duration: 6000,
      className: "auth-validation-toast",
    });
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setFieldErrors({});
    const url = nextMode === "signup" ? "/signup" : "/login";
    window.history.replaceState(window.history.state, "", url);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    const trimmedFullName = fullName.trim();
    const nextErrors: Partial<Record<FieldName, string>> = {};

    if (isSignup && !trimmedFullName) {
      nextErrors.fullName = "Full name is required.";
      showValidationToast("Full name is required.", "Add your name before creating the account.");
    }
    if (!trimmedEmail) {
      nextErrors.email = "Email is required.";
      showValidationToast("Email is required.", "Enter the email for this workspace.");
    }
    if (!trimmedPassword) {
      nextErrors.password = "Password is required.";
      showValidationToast(
        "Password is required.",
        isSignup ? "Create a password before signing up." : "Enter your password to continue.",
      );
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setLoading(true);

    try {
      const result = isSignup
        ? await signUpWithEmail({
            email: trimmedEmail,
            password: trimmedPassword,
            full_name: trimmedFullName || undefined,
          })
        : await loginWithEmail({ email: trimmedEmail, password: trimmedPassword });

      saveAuthSession(result.session, result.user);
      router.replace(isSignup ? "/onboarding" : redirectTo);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Authentication failed.",
        {
          description: isSignup ? "Try a different email or sign in instead." : "Check your credentials and try again.",
        },
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-[460px] flex-col rounded-[24px] border border-border bg-card p-6 text-card-foreground shadow-[0_1px_2px_rgba(39,23,13,0.04),0_20px_56px_-32px_rgba(74,39,17,0.18)] sm:min-h-[560px] sm:p-8 dark:border-white/10 dark:bg-[#0d0d0c] dark:shadow-[0_30px_80px_-42px_rgba(0,0,0,0.7)]">
      <div className="mb-8 min-h-[118px]">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#bd4f13] dark:text-[#f6e879]">
          Kontext workspace
        </p>
        <h1 className="mt-4 font-heading text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl dark:text-[#f4f3ec]">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground dark:text-white/50">
          {isSignup
            ? "Use email and password to open your workspace."
            : "Sign in to access your chats, profile, and artifact history."}
        </p>
      </div>

      <Tabs
        value={mode}
        onValueChange={(nextMode) => switchMode(nextMode as Mode)}
        className="mb-6 gap-0"
      >
        <TabsList className="relative grid h-14 w-full grid-cols-2 overflow-hidden rounded-[14px] border border-border bg-muted p-1.5 dark:border-white/10 dark:bg-white/[0.03]">
          <motion.div
            aria-hidden="true"
            className="absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-[12px] bg-background shadow-[0_10px_26px_-18px_rgba(0,0,0,0.55)] ring-1 ring-black/5 dark:bg-[#0d0d0c] dark:shadow-[0_12px_28px_-16px_rgba(0,0,0,0.7)] dark:ring-white/5"
            animate={{ x: mode === "login" ? 0 : "100%" }}
            transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.7 }}
          />
          <TabsTrigger
            value="login"
            className="relative z-10 cursor-pointer rounded-[12px] px-4 py-2.5 text-[13px] font-semibold tracking-[-0.01em] text-muted-foreground transition-[color,transform] duration-150 hover:-translate-y-px hover:text-foreground active:translate-y-0 active:scale-[0.99] data-[state=active]:text-foreground dark:hover:text-white dark:data-[state=active]:text-[#f4f3ec]"
          >
            Log In
          </TabsTrigger>
          <TabsTrigger
            value="signup"
            className="relative z-10 cursor-pointer rounded-[12px] px-4 py-2.5 text-[13px] font-semibold tracking-[-0.01em] text-muted-foreground transition-[color,transform] duration-150 hover:-translate-y-px hover:text-foreground active:translate-y-0 active:scale-[0.99] data-[state=active]:text-foreground dark:hover:text-white dark:data-[state=active]:text-[#f4f3ec]"
          >
            Sign Up
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <form className="flex min-h-[314px] flex-1 flex-col" onSubmit={handleSubmit}>
        <div className="grid flex-1 content-start gap-4">
          {isSignup ? (
            <Field
              label="Full name"
              value={fullName}
              onChange={(value) => {
                setFullName(value);
                if (fieldErrors.fullName) {
                  setFieldErrors((current) => ({ ...current, fullName: undefined }));
                }
              }}
              placeholder="John Doe"
              error={fieldErrors.fullName}
            />
          ) : null}

          <Field
            label="Email"
            value={email}
            onChange={(value) => {
              setEmail(value);
              if (fieldErrors.email) {
                setFieldErrors((current) => ({ ...current, email: undefined }));
              }
            }}
            placeholder="you@example.com"
            type="email"
            error={fieldErrors.email}
          />
          <Field
            label="Password"
            value={password}
            onChange={(value) => {
              setPassword(value);
              if (fieldErrors.password) {
                setFieldErrors((current) => ({ ...current, password: undefined }));
              }
            }}
            placeholder="Minimum 8 characters"
            type="password"
            error={fieldErrors.password}
          />
        </div>

        <div className="mt-7">
          <div className="relative py-2">
            <div className="h-px bg-border dark:bg-white/10" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-[11px] uppercase tracking-[0.22em] text-muted-foreground dark:bg-[#0d0d0c] dark:text-white/30">
              or continue with
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() =>
                toast.info("Google sign-in is not configured yet.", {
                  description: "Use email and password for now.",
                  duration: 1800,
                })
              }
              className={socialButtonClass}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 48 48"
                className="size-[15px] shrink-0"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill="#FFC107"
                  d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917"
                />
                <path
                  fill="#FF3D00"
                  d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.9 11.9 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44"
                />
                <path
                  fill="#1976D2"
                  d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917"
                />
              </svg>
              Google
            </button>
            <button
              type="button"
              onClick={() =>
                toast.info("GitHub sign-in is not configured yet.", {
                  description: "Use email and password for now.",
                  duration: 1800,
                })
              }
              className={socialButtonClass}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 1024 1024"
                className="hidden size-[15px] shrink-0 dark:block"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill="#ffffff"
                  fillRule="evenodd"
                  d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.01C10.01 14.08 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z"
                  transform="scale(64)"
                  clipRule="evenodd"
                />
              </svg>
              <svg
                aria-hidden="true"
                viewBox="0 0 1024 1024"
                className="size-[15px] shrink-0 dark:hidden"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill="#1b1f23"
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M512 0C229.12 0 0 229.12 0 512c0 226.56 146.56 417.92 350.08 485.76 25.6 4.48 35.2-10.88 35.2-24.32 0-12.16-.64-52.48-.64-95.36-128.64 23.68-161.92-31.36-172.16-60.16-5.76-14.72-30.72-60.16-52.48-72.32-17.92-9.6-43.52-33.28-.64-33.92 40.32-.64 69.12 37.12 78.72 52.48 46.08 77.44 119.68 55.68 149.12 42.24 4.48-33.28 17.92-55.68 32.64-68.48-113.92-12.8-232.96-56.96-232.96-252.8 0-55.68 19.84-101.76 52.48-137.6-5.12-12.8-23.04-65.28 5.12-135.68 0 0 42.88-13.44 140.8 52.48 40.96-11.52 84.48-17.28 128-17.28s87.04 5.76 128 17.28c97.92-66.56 140.8-52.48 140.8-52.48 28.16 70.4 10.24 122.88 5.12 135.68 32.64 35.84 52.48 81.28 52.48 137.6 0 196.48-119.68 240-233.6 252.8 18.56 16 34.56 46.72 34.56 94.72 0 68.48-.64 123.52-.64 140.8 0 13.44 9.6 29.44 35.2 24.32C877.44 929.92 1024 737.92 1024 512 1024 229.12 794.88 0 512 0"
                />
              </svg>
              GitHub
            </button>
          </div>
        </div>

        <div className="mt-8">
          <button
            type="submit"
            disabled={loading}
            className="auth-submit-button group relative isolate w-full cursor-pointer overflow-hidden rounded-[12px] px-4 py-3 text-sm font-semibold shadow-[0_12px_28px_-18px_rgba(246,232,121,0.7)] transition-[background-color,color,transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-[0_16px_34px_-18px_rgba(246,232,121,0.85)] active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6e879]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              aria-hidden="true"
              className="auth-submit-fill pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
              style={{ background: "#f6e879" }}
            />
            <span className="relative z-10 text-[#171814]">
              {loading
                ? isSignup
                  ? "Creating account..."
                  : "Signing in..."
                : isSignup
                  ? "Sign up"
                  : "Login"}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  error?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground/80 dark:text-white/80">{label}</span>
      <div className="relative">
        <input
          type={isPassword && showPassword ? "text" : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-invalid={error ? "true" : "false"}
          className={`auth-input w-full appearance-none rounded-[12px] border bg-background px-4 py-3 text-sm text-foreground outline-none transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-border focus:border-ring focus:ring-2 focus:ring-ring/10 dark:bg-white/[0.03] dark:text-white dark:placeholder:text-white/25 dark:focus:border-[#f6e879]/55 dark:focus:ring-[#f6e879]/10 ${
            error
              ? "border-red-400 ring-2 ring-red-400/20 dark:border-red-400/70 dark:ring-red-400/20"
              : "border-input dark:border-white/10 dark:hover:border-white/15"
          }`}
          style={isPassword ? { paddingRight: "2.75rem" } : undefined}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-full border border-border bg-background p-1.5 text-foreground/70 shadow-[0_8px_24px_rgba(0,0,0,0.1)] transition-[background-color,border-color,color,opacity,transform,box-shadow] duration-150 hover:-translate-y-1/2 hover:border-border hover:bg-muted hover:text-foreground hover:shadow-[0_10px_28px_rgba(0,0,0,0.14)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:shadow-[0_8px_24px_rgba(0,0,0,0.2)] dark:hover:border-white/20 dark:hover:bg-white/[0.08] dark:hover:text-white dark:focus-visible:ring-[#f6e879]/50 ${
              value.trim() ? "opacity-100" : "opacity-35"
            }`}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-500 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </label>
  );
}

export default function AuthForm({ mode }: { mode: Mode }) {
  return (
    <Suspense fallback={null}>
      <AuthFormInner mode={mode} />
    </Suspense>
  );
}
