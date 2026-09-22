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
          toast: "TrueMemory-toast font-sans",
          title: "TrueMemory-toast__title",
          description: "TrueMemory-toast__description",
          icon: "TrueMemory-toast__icon",
        },
      }}
      {...props}
    />
  );
}
