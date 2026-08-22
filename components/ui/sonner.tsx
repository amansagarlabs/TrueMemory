"use client";

import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      closeButton={false}
      position="bottom-right"
      theme="system"
      className="!z-[2147483647]"
      toastOptions={{
        duration: 2500,
        classNames: {
          toast: "kontext-toast font-sans",
          title: "kontext-toast__title",
          description: "kontext-toast__description",
          icon: "kontext-toast__icon",
        },
      }}
      {...props}
    />
  );
}
