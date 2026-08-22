export const maxDuration = 60;

const MAX_PROMPT_LENGTH = 2_000;
const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";
const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image";

type ImageRequest = {
  prompt?: unknown;
};

type OpenRouterImageResponse = {
  data?: Array<{ b64_json?: string; media_type?: string }>;
  error?: { message?: string; code?: string };
};

export async function POST(req: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        success: false,
        error:
          "Image generation is not configured. Add OPENROUTER_API_KEY to the server environment.",
      },
      { status: 503 },
    );
  }

  let body: ImageRequest;
  try {
    body = (await req.json()) as ImageRequest;
  } catch {
    return Response.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return Response.json(
      { success: false, error: "A prompt is required." },
      { status: 400 },
    );
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return Response.json(
      {
        success: false,
        error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`,
      },
      { status: 400 },
    );
  }

  const model = process.env.OPENROUTER_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;

  try {
    const response = await fetch(OPENROUTER_IMAGES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
        "X-Title": "Kontext",
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        output_format: "png",
      }),
    });

    const payload = (await response.json().catch(() => null)) as OpenRouterImageResponse | null;

    if (!response.ok) {
      const providerMessage = payload?.error?.message || "OpenRouter image generation failed.";
      console.error("image_generation_failed", {
        statusCode: response.status,
        model,
        providerMessage,
      });

      if (response.status === 401 || response.status === 403) {
        return Response.json(
          {
            success: false,
            error:
              "OpenRouter rejected the server key. Verify OPENROUTER_API_KEY and image-model access.",
          },
          { status: 502 },
        );
      }

      if (response.status === 429) {
        return Response.json(
          { success: false, error: "OpenRouter rate limit reached. Please try again shortly." },
          { status: 429 },
        );
      }

      if (response.status === 402) {
        return Response.json(
          {
            success: false,
            error:
              "Image generation requires OpenRouter credits. Add credits to the account or organization linked to OPENROUTER_API_KEY, then try again.",
          },
          { status: 402 },
        );
      }

      return Response.json(
        { success: false, error: providerMessage },
        { status: 502 },
      );
    }

    const image = payload?.data?.[0];
    if (!image?.b64_json) {
      console.error("image_generation_failed", { statusCode: response.status, model, reason: "missing_image_data" });
      return Response.json(
        { success: false, error: "OpenRouter returned no image data. Try another image model." },
        { status: 502 },
      );
    }

    const mediaType = image.media_type || "image/png";
    const imageData = image.b64_json.startsWith("data:")
      ? image.b64_json
      : `data:${mediaType};base64,${image.b64_json}`;

    return Response.json({ imageData, model, success: true });
  } catch (error) {
    console.error("image_generation_failed", {
      model,
      message: error instanceof Error ? error.message : "unknown provider error",
    });
    return Response.json(
      { success: false, error: "OpenRouter image generation is unavailable. Please try again." },
      { status: 502 },
    );
  }
}
