import IORedis from "ioredis";
import { Queue, QueueEvents, Worker, type Job } from "bullmq";
import { cacheService } from "@/lib/cache/cache-service";
import { cacheKeys } from "@/lib/cache/keys";
import { TTL } from "@/lib/cache/ttl";
import { scrapeWithRetry } from "@/lib/web-scrape";
import { searchConfiguredWeb } from "@/lib/web-search";

export type AgentJobStatus = "queued" | "running" | "complete" | "failed";

export type AgentJobRecord = {
  id: string;
  status: AgentJobStatus;
  prompt: string;
  schema?: object;
  maxSteps: number;
  maxCredits?: number;
  progress: string[];
  output?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

type AgentPayload = {
  prompt: string;
  schema?: object;
  maxSteps?: number;
  maxCredits?: number;
};

const redisUrl = process.env.REDIS_URL;
const useRedis = Boolean(redisUrl);
const connection = useRedis ? new IORedis(redisUrl!, { maxRetriesPerRequest: null }) : null;
const memoryJobs = new Map<string, AgentJobRecord>();
const memoryQueue: string[] = [];
let workerStarted = false;
const DEFAULT_AGENT_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
let bullWorkerInitialized = false;
const JOB_TTL_SECONDS = 60 * 60 * 24;

if (!useRedis) {
  console.warn("[agent] REDIS_URL not set - using in-memory queue (dev only, not distributed)");
}

const queue = useRedis && connection
  ? new Queue<AgentPayload>("kontext-agent", { connection })
  : null;
const queueEvents = useRedis && connection
  ? new QueueEvents("kontext-agent", { connection })
  : null;

function createJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function now(): number {
  return Date.now();
}

function createMemoryRecord(payload: AgentPayload, id = createJobId()): AgentJobRecord {
  return {
    id,
    status: "queued",
    prompt: payload.prompt,
    schema: payload.schema,
    maxSteps: payload.maxSteps ?? 10,
    maxCredits: payload.maxCredits,
    progress: ["Job queued"],
    createdAt: now(),
    updatedAt: now(),
  };
}

async function persistJobRecord(record: AgentJobRecord): Promise<void> {
  await cacheService.set(`agent:job:${record.id}`, record, JOB_TTL_SECONDS);
}

async function loadJobRecord(jobId: string): Promise<AgentJobRecord | null> {
  return await cacheService.get<AgentJobRecord>(`agent:job:${jobId}`);
}

async function planAndResearch(job: AgentJobRecord): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const maxSteps = Math.min(Math.max(job.maxSteps || 10, 1), 10);
  const sources: Array<{
    query: string;
    url: string;
    title: string;
    description: string;
    markdown: string;
    position: number;
  }> = [];
  let context = "";

  if (!apiKey) {
    const hits = await searchConfiguredWeb(job.prompt.slice(0, 180), 3);
    for (const hit of hits) {
      job.progress.push(`Scraping: ${hit.url}`);
      const scraped = await scrapeWithRetry(hit.url);
      sources.push({
        query: job.prompt,
        url: hit.url,
        title: scraped.metadata.title || hit.title,
        description: scraped.metadata.description || hit.description,
        markdown: scraped.markdown.slice(0, 6000),
        position: hit.position,
      });
    }
    return {
      prompt: job.prompt,
      sources,
      note: "No OPENROUTER_API_KEY configured. Used fallback research loop.",
    };
  }

  for (let step = 0; step < maxSteps; step++) {
    const plannerResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
        "X-Title": "Kontext",
      },
      body: JSON.stringify({
        model: DEFAULT_AGENT_MODEL,
        temperature: 0.2,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "You are a web research planner. Return strict JSON: {\"query\":\"...\",\"reason\":\"...\",\"stop\":false} or {\"stop\":true,\"reason\":\"...\"}. Choose one targeted search query at a time.",
          },
          {
            role: "user",
            content: `Goal: ${job.prompt}\n\nContext:\n${context || "(none yet)"}\n\nWhat next?`,
          },
        ],
      }),
    });

    if (!plannerResponse.ok) {
      throw new Error(`Planner failed (${plannerResponse.status})`);
    }

    const plannerData = await plannerResponse.json();
    const content = plannerData?.choices?.[0]?.message?.content ?? "{}";
    let instruction: { query?: string; reason?: string; stop?: boolean };
    try {
      instruction = JSON.parse(String(content).replace(/```json|```/g, "").trim());
    } catch {
      instruction = { query: job.prompt.slice(0, 120), reason: "Fallback parsing failure", stop: false };
    }

    if (instruction.stop) {
      job.progress.push(`Planner stop: ${instruction.reason || "done"}`);
      break;
    }

    const query = (instruction.query || job.prompt).slice(0, 180);
    job.progress.push(`Search query: ${query}`);
    const hits = await searchConfiguredWeb(query, 3);
    job.progress.push(`Search hit count: ${hits.length}`);

    for (const hit of hits) {
      job.progress.push(`Scraping: ${hit.url}`);
      const scraped = await scrapeWithRetry(hit.url);
      sources.push({
        query,
        url: hit.url,
        title: scraped.metadata.title || hit.title,
        description: scraped.metadata.description || hit.description,
        markdown: scraped.markdown.slice(0, 6000),
        position: hit.position,
      });
    }

    context = JSON.stringify(
      sources.slice(-5).map((source) => ({
        query: source.query,
        url: source.url,
        title: source.title,
        description: source.description,
        markdown: source.markdown.slice(0, 1200),
      })),
      null,
      2,
    ).slice(0, 6000);
  }

  const synthesisResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
      "X-Title": "Kontext",
    },
    body: JSON.stringify({
      model: DEFAULT_AGENT_MODEL,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "You synthesize source-backed web research. Be concise. If the user asked for facts, return a direct answer plus a short sources array.",
        },
        {
          role: "user",
          content: `Prompt: ${job.prompt}\n\nSources:\n${context || "[]"}`,
        },
      ],
    }),
  });

  if (!synthesisResponse.ok) {
    throw new Error(`Synthesis failed (${synthesisResponse.status})`);
  }

  const synthesisData = await synthesisResponse.json();
  return {
    prompt: job.prompt,
    steps: job.progress.filter((line) => line.startsWith("Search query:")).map((line, index) => ({ id: String(index + 1), line })),
    sources,
    answer: synthesisData?.choices?.[0]?.message?.content ?? "",
    model: DEFAULT_AGENT_MODEL,
  };
}

async function runMemoryWorker() {
  if (workerStarted) return;
  workerStarted = true;
  try {
    while (memoryQueue.length) {
      const jobId = memoryQueue.shift();
      if (!jobId) continue;
      const job = memoryJobs.get(jobId);
      if (!job) continue;
      try {
        job.status = "running";
        job.updatedAt = now();
        job.progress.push("Starting research loop");
      const output = await planAndResearch(job);
      job.output = output;
      job.status = "complete";
      job.updatedAt = now();
      job.progress.push("Research complete");
      await finalizeAgentOutput(job.prompt, job.schema, output);
      await persistJobRecord(job);
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Agent failed.";
      job.updatedAt = now();
      job.progress.push(job.error);
      await persistJobRecord(job);
    }
  }
  } finally {
    workerStarted = false;
  }
}

async function enqueueBullJob(payload: AgentPayload, id: string) {
  if (!queue) return;
  await queue.add("research", payload, {
    jobId: id,
    removeOnComplete: false,
    removeOnFail: false,
  });
}

export async function submitAgentJob(payload: AgentPayload): Promise<{ jobId: string; status: "queued"; cached?: boolean; output?: unknown }> {
  const cacheKey = cacheKeys.agentResult(payload.prompt, payload.schema);
  const cached = await cacheService.get<unknown>(cacheKey);
  if (cached !== null) {
    return { jobId: "cached", status: "queued", cached: true, output: cached };
  }

  const jobId = createJobId();
  const record = createMemoryRecord(payload, jobId);

  if (queue && connection) {
    await ensureBullWorker();
    await enqueueBullJob(payload, jobId);
  } else {
    memoryJobs.set(jobId, record);
    memoryQueue.push(jobId);
    void runMemoryWorker();
  }
  await persistJobRecord(record);

  return { jobId, status: "queued" };
}

export async function getAgentJob(jobId: string): Promise<AgentJobRecord | null> {
  if (queue) {
    const job = await queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    const progress = Array.isArray(job.progress) ? job.progress.map((item) => String(item)) : [];
    return {
      id: job.id || jobId,
      status:
        state === "completed"
          ? "complete"
          : state === "failed"
            ? "failed"
            : state === "active"
              ? "running"
              : "queued",
      prompt: job.data.prompt,
      schema: job.data.schema,
      maxSteps: job.data.maxSteps ?? 10,
      maxCredits: job.data.maxCredits,
      progress,
      output: job.returnvalue ?? undefined,
      error: job.failedReason ?? undefined,
      createdAt: job.timestamp,
      updatedAt: job.processedOn || job.timestamp,
    };
  }

  return memoryJobs.get(jobId) ?? (await loadJobRecord(jobId));
}

export async function closeAgentResources(): Promise<void> {
  await queue?.close();
  await queueEvents?.close();
  await connection?.quit();
}

export async function finalizeAgentOutput(prompt: string, schema: object | undefined, output: unknown): Promise<void> {
  const key = cacheKeys.agentResult(prompt, schema);
  await cacheService.set(key, output, TTL.AGENT_RESULT);
}

export async function ensureBullWorker() {
  if (!queue || !connection || bullWorkerInitialized) return;
  bullWorkerInitialized = true;
  const worker = new Worker<AgentPayload>(
    "kontext-agent",
    async (job: Job<AgentPayload>) => {
      const jobId = String(job.id || createJobId());
      const record = createMemoryRecord(job.data, jobId);
      record.status = "running";
      memoryJobs.set(jobId, record);
      record.progress.push("Starting research loop");
      const output = await planAndResearch(record);
      record.output = output;
      record.status = "complete";
      record.updatedAt = now();
      record.progress.push("Research complete");
      await finalizeAgentOutput(job.data.prompt, job.data.schema, output);
      await persistJobRecord(record);
      return output;
    },
    { connection },
  );
  void worker.waitUntilReady();
  worker.on("failed", async (job, err) => {
    if (!job) return;
    const jobId = String(job.id || createJobId());
    const record = memoryJobs.get(jobId) || createMemoryRecord(job.data, jobId);
    record.status = "failed";
    record.error = err.message;
    record.updatedAt = now();
    memoryJobs.set(jobId, record);
    void persistJobRecord(record);
  });
  queueEvents?.on("failed", ({ jobId, failedReason }) => {
    const record = memoryJobs.get(jobId);
    if (record) {
      record.status = "failed";
      record.error = failedReason;
      record.updatedAt = now();
      void persistJobRecord(record);
    }
  });
}
