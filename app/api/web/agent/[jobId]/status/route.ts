import { getAgentJob } from "@/lib/web-agent";

export async function GET(_req: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = await getAgentJob(jobId);
  if (!job) {
    return Response.json({ status: "failed", error: "Job not found" }, { status: 404 });
  }

  return Response.json({
    status: job.status,
    output: job.output,
    progress: job.progress.join(" | "),
    error: job.error,
  });
}
