import { getAgentJob, submitAgentJob } from "@/lib/web-agent";

export const maxDuration = 30;

type AgentRequest = {
  prompt?: unknown;
  maxSteps?: unknown;
  schema?: unknown;
  maxCredits?: unknown;
};

export async function POST(req: Request) {
  let body: AgentRequest;
  try {
    body = (await req.json()) as AgentRequest;
  } catch {
    return Response.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return Response.json({ success: false, error: "A prompt is required." }, { status: 400 });
  }

  const schema = typeof body.schema === "object" && body.schema ? (body.schema as object) : undefined;
  const maxSteps = typeof body.maxSteps === "number" ? body.maxSteps : undefined;
  const maxCredits = typeof body.maxCredits === "number" ? body.maxCredits : undefined;
  const job = await submitAgentJob({ prompt, schema, maxSteps, maxCredits });
  return Response.json({ success: true, jobId: job.jobId, status: "queued", cached: job.cached, output: job.output });
}

export async function GET(req: Request) {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) {
    return Response.json({ success: false, error: "jobId is required." }, { status: 400 });
  }

  const job = await getAgentJob(jobId);
  if (!job) {
    return Response.json({ success: false, error: "Job not found." }, { status: 404 });
  }

  return Response.json({ success: true, jobId: job.id, status: job.status, output: job.output, progress: job.progress.join(" | "), error: job.error });
}
