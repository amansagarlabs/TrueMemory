"use client";

import { useState } from "react";
import { PaperDither, type DitherShape } from "@/components/ui/paper-dither";
import { IconCheck, IconX } from "@tabler/icons-react";

const AVATAR_KEY = "kontext-dither-avatar";

export const avatars: Array<{
  id: string;
  label: string;
  shape: DitherShape;
  colorBack: string;
  colorFront: string;
  scale: number;
}> = [
  { id: "signal", label: "Signal", shape: "wave", colorBack: "#090806", colorFront: "#f06418", scale: 0.82 },
  { id: "memory", label: "Memory", shape: "warp", colorBack: "#090806", colorFront: "#f6e879", scale: 0.9 },
  { id: "orbit", label: "Orbit", shape: "swirl", colorBack: "#090806", colorFront: "#8c82ff", scale: 0.74 },
  { id: "source", label: "Source", shape: "ripple", colorBack: "#090806", colorFront: "#67d9bd", scale: 0.86 },
];

export function getAvatarFromStorage(): (typeof avatars)[number] {
  if (typeof window === "undefined") return avatars[0];
  const id = localStorage.getItem(AVATAR_KEY) || avatars[0].id;
  return avatars.find((a) => a.id === id) || avatars[0];
}

export function saveAvatarToStorage(id: string) {
  localStorage.setItem(AVATAR_KEY, id);
}

export function DitherAvatar({ avatar, className }: { avatar?: (typeof avatars)[number]; className?: string }) {
  const resolved = avatar || getAvatarFromStorage();
  return (
    <span className={`relative block overflow-hidden rounded-full border border-white/10 bg-[#080706] ${className || ""}`}>
      <PaperDither
        className="inset-0"
        dark={{ colorBack: resolved.colorBack, colorFront: resolved.colorFront }}
        light={{ colorBack: resolved.colorBack, colorFront: resolved.colorFront }}
        eager
        maxPixelCount={180 * 180}
        scale={resolved.scale}
        shape={resolved.shape}
        size={2}
        speed={0.12}
        type="4x4"
      />
      <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),inset_0_-18px_30px_rgba(0,0,0,0.35)]" />
    </span>
  );
}

interface AvatarPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AvatarPicker({ open, onOpenChange }: AvatarPickerProps) {
  const [selectedId, setSelectedId] = useState(() => getAvatarFromStorage().id);

  function chooseAvatar(id: string) {
    setSelectedId(id);
    saveAvatarToStorage(id);
    onOpenChange(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div className="mx-4 w-full max-w-md rounded-2xl border border-white/10 bg-[#10100f] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Choose your avatar</h3>
          <button type="button" onClick={() => onOpenChange(false)} className="text-white/40 hover:text-white">
            <IconX className="size-5" />
          </button>
        </div>
        <div role="radiogroup" aria-label="Choose a dither avatar" className="mt-5 grid grid-cols-2 gap-3">
          {avatars.map((avatar) => {
            const active = selectedId === avatar.id;
            return (
              <button key={avatar.id} type="button" role="radio" aria-checked={active} onClick={() => chooseAvatar(avatar.id)} className={`relative flex flex-col items-center gap-3 rounded-[16px] border p-4 transition ${active ? "border-[#f6e879]/70 bg-[#f6e879]/[0.06]" : "border-white/[0.08] bg-black/25 hover:border-white/20"}`}>
                <DitherAvatar avatar={avatar} className="size-24" />
                <span className={`text-sm font-medium ${active ? "text-[#f6e879]" : "text-white/50"}`}>{avatar.label}</span>
                {active ? <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-[#f6e879] text-[#171814]"><IconCheck className="size-3" /></span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
