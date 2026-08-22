"use client";

import { useCallback, useMemo, useState } from "react";
import type { ChangeEvent } from "react";

export type InputValidationEvent =
  | ChangeEvent<HTMLInputElement>
  | ChangeEvent<HTMLTextAreaElement>
  | ChangeEvent<HTMLSelectElement>;

export type InputValidationOptions = {
  initialValue?: string;
  sanitize?: (value: string) => string;
  validate?: (value: string) => string | null;
};

export const WORKSPACE_NAME_HELPER =
  "Use letters, numbers, hyphens, or underscores. No spaces or slashes.";

export function sanitizeWorkspaceName(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "");
}

export function validateWorkspaceName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Workspace name is required.";
  if (trimmed.length < 3) return "Workspace name must be at least 3 characters.";
  if (trimmed.length > 80) return "Workspace name must be 80 characters or fewer.";
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return "Use letters, numbers, hyphens, or underscores only.";
  }
  return null;
}

export function useInputValidation({
  initialValue = "",
  sanitize = (value: string) => value,
  validate,
}: InputValidationOptions = {}) {
  const [value, setValueState] = useState(() => sanitize(initialValue));
  const [touched, setTouched] = useState(false);

  const validationMessage = useMemo(
    () => (validate ? validate(value) : null),
    [validate, value],
  );

  const error = touched ? validationMessage : null;

  const setValue = useCallback(
    (nextValue: string) => {
      setValueState(sanitize(nextValue));
    },
    [sanitize],
  );

  const onChange = useCallback(
    (eventOrValue: InputValidationEvent | string) => {
      const nextValue =
        typeof eventOrValue === "string"
          ? eventOrValue
          : eventOrValue.target.value;
      setTouched(true);
      setValueState(sanitize(nextValue));
    },
    [sanitize],
  );

  const onBlur = useCallback(() => {
    setTouched(true);
  }, []);

  const reset = useCallback(
    (nextValue = initialValue) => {
      setTouched(false);
      setValueState(sanitize(nextValue));
    },
    [initialValue, sanitize],
  );

  return {
    value,
    setValue,
    onChange,
    onBlur,
    reset,
    error,
    isValid: validationMessage === null,
    touched,
    validationMessage,
  };
}
