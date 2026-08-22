import { generateImageWithPuter } from "@/services/puter-image-generation";

export type GenerateImageResult =
  | { success: true; imageData: string }
  | { success: false; error: string };

/**
 * Generate an image without requiring developer credits by default.
 * Set NEXT_PUBLIC_IMAGE_GENERATOR=openrouter to explicitly use the paid
 * server-side OpenRouter route instead.
 */
export async function generateImage(prompt: string): Promise<GenerateImageResult> {
  const provider = process.env.NEXT_PUBLIC_IMAGE_GENERATOR || "puter";

  if (provider !== "openrouter") {
    try {
      return {
        success: true,
        imageData: await generateImageWithPuter(prompt),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? `${error.message} Sign in to Puter if it asks for an account, then try again.`
            : "Free image generation is unavailable. Sign in to Puter and try again.",
      };
    }
  }

  const response = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  let payload: GenerateImageResult;
  try {
    payload = (await response.json()) as GenerateImageResult;
  } catch {
    return {
      success: false,
      error: `Image generation failed (${response.status}).`,
    };
  }

  if (!response.ok || !payload.success) {
    return {
      success: false,
      error: payload.success ? `Image generation failed (${response.status}).` : payload.error,
    };
  }

  return payload;
}
