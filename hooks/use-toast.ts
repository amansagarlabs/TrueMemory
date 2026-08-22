"use client";

import { toast as sonnerToast } from "sonner";

type ToastMessage = Parameters<typeof sonnerToast>[0];
type ToastOptions = Parameters<typeof sonnerToast>[1];
type ToastMethod = (
  message: ToastMessage,
  options?: ToastOptions,
) => string | number;

function withStableId(
  type: string,
  message: ToastMessage,
  options?: ToastOptions,
): ToastOptions {
  if (options?.id !== undefined || typeof message !== "string") return options;

  return {
    ...options,
    id: `kontext:${type}:${message}`,
  };
}

function createToastMethod(type: string, method: ToastMethod): ToastMethod {
  return (message, options) => method(message, withStableId(type, message, options));
}

const showToast = createToastMethod("default", sonnerToast);

const toast = Object.assign(showToast, {
  show: showToast,
  message: createToastMethod("message", sonnerToast.message),
  success: createToastMethod("success", sonnerToast.success),
  info: createToastMethod("info", sonnerToast.info),
  warning: createToastMethod("warning", sonnerToast.warning),
  error: createToastMethod("error", sonnerToast.error),
  loading: createToastMethod("loading", sonnerToast.loading),
  promise: sonnerToast.promise,
  dismiss: sonnerToast.dismiss,
  getHistory: sonnerToast.getHistory,
  getToasts: sonnerToast.getToasts,
});

export function useToast() {
  return toast;
}
