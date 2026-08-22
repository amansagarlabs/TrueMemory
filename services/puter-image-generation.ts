"use client";

type PuterImageElement = HTMLImageElement & {
  src: string;
};

type PuterImageApi = {
  txt2img: (
    prompt: string,
    options?: { model?: string; quality?: string },
  ) => Promise<PuterImageElement>;
};

type PuterGlobal = {
  ai?: PuterImageApi;
};

declare global {
  interface Window {
    puter?: PuterGlobal;
    __kontextPuterLoader?: Promise<PuterGlobal>;
  }
}

const PUTER_SCRIPT_URL = "https://js.puter.com/v2/";
const DEFAULT_PUTER_IMAGE_MODEL = "black-forest-labs/flux-2-klein-4b";

function loadPuter(): Promise<PuterGlobal> {
  if (window.puter?.ai) return Promise.resolve(window.puter);
  if (window.__kontextPuterLoader) return window.__kontextPuterLoader;

  window.__kontextPuterLoader = new Promise<PuterGlobal>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PUTER_SCRIPT_URL}"]`,
    );
    const script = existing ?? document.createElement("script");

    const finish = () => {
      if (window.puter?.ai) {
        resolve(window.puter);
      } else {
        reject(new Error("Puter.js loaded without image generation support."));
      }
    };

    script.addEventListener("load", finish, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Puter.js could not be loaded.")),
      { once: true },
    );

    if (!existing) {
      script.src = PUTER_SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    window.__kontextPuterLoader = undefined;
    throw error;
  });

  return window.__kontextPuterLoader;
}

/**
 * Generate through Puter.js. Puter authenticates users in the browser and
 * does not require a provider key or a paid server account.
 */
export async function generateImageWithPuter(prompt: string): Promise<string> {
  const puter = await loadPuter();
  if (!puter.ai) throw new Error("Puter image generation is unavailable.");

  const image = await puter.ai.txt2img(prompt, {
    model: process.env.NEXT_PUBLIC_PUTER_IMAGE_MODEL || DEFAULT_PUTER_IMAGE_MODEL,
  });
  if (!image?.src) throw new Error("Puter returned no image data.");
  return image.src;
}
