import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { cacheService } from "@/lib/cache/cache-service";
import { validatePublicUrl } from "@/lib/web-intel";

export type ScrapeMetadata = {
  title: string;
  description: string;
  statusCode: number;
  sourceURL: string;
  ogImage?: string;
};

export type ScrapeOutput = {
  markdown: string;
  html: string;
  metadata: ScrapeMetadata;
  links: string[];
};

const POOL_SIZE = 3;
const browserPool: Array<Promise<Browser> | Browser | null> = Array.from({ length: POOL_SIZE }, () => null);
let nextBrowserIndex = 0;
type SessionStatus = "active" | "checkpointed" | "rehydrating" | "restored" | "expired" | "stale";
type StoredStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

type LiveScrapeSession = {
  context: BrowserContext;
  page: Page;
  createdAt: number;
  lastUsedAt: number;
};

const pageSessions = new Map<string, LiveScrapeSession>();
const SESSION_TTL_MS = 5 * 60 * 1000;
const SESSION_REGISTRY_TTL_SECONDS = 60 * 5;
const sessionKey = (scrapeId: string) => `session:scrape:${scrapeId}`;

async function getBrowser(): Promise<Browser> {
  const index = nextBrowserIndex++ % POOL_SIZE;
  const existing = browserPool[index];
  if (existing instanceof Promise) return existing;
  if (existing) return existing;

  const browserPromise = chromium.launch({
    headless: true,
  });
  browserPool[index] = browserPromise;

  const browser = await browserPromise;
  browserPool[index] = browser;
  browser.on("disconnected", () => {
    if (browserPool[index] === browser) browserPool[index] = null;
  });
  return browser;
}

async function protectPage(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (!/^https?:/i.test(requestUrl)) {
      await route.continue();
      return;
    }

    try {
      await validatePublicUrl(requestUrl);
      await route.continue();
    } catch {
      await route.abort("blockedbyclient");
    }
  });
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function toMarkdownFromHtml(html: string): string {
  const replaced = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "");

  const blocks = replaced.match(/<(h[1-6]|p|li|pre|code|blockquote|td|th|title)[^>]*>[\s\S]*?<\/\1>/gi) ?? [];
  const lines: string[] = [];

  for (const block of blocks) {
    const tag = /<([a-z0-9]+)/i.exec(block)?.[1].toLowerCase() ?? "";
    const text = cleanText(
      block
        .replace(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>(.*?)<\/a>/gi, "$3 [$2]")
        .replace(/<[^>]+>/g, " "),
    );
    if (!text) continue;
    if (tag === "title") continue;
    if (tag === "h1") lines.push(`# ${text}`);
    else if (tag === "h2") lines.push(`## ${text}`);
    else if (tag === "h3") lines.push(`### ${text}`);
    else if (tag === "h4") lines.push(`#### ${text}`);
    else if (tag === "h5") lines.push(`##### ${text}`);
    else if (tag === "h6") lines.push(`###### ${text}`);
    else if (tag === "li") lines.push(`- ${text}`);
    else if (tag === "blockquote") lines.push(`> ${text}`);
    else lines.push(text);
  }

  return lines.join("\n\n").trim();
}

async function scrapeOnce(url: string, waitForMs = 0): Promise<ScrapeOutput> {
  const safeUrl = await validatePublicUrl(url);
  const browser = await getBrowser();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1600 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  });
  await protectPage(page);

  try {
    const response = await page.goto(safeUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    if (waitForMs > 0) {
      await page.waitForTimeout(Math.min(waitForMs, 10_000));
    }
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    const html = await page.content();
    const metadata = await page.evaluate(() => {
      const meta = (name: string) =>
        document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute("content") || "";
      return {
        title: document.title || "",
        description: meta("description") || meta("og:description"),
        ogImage: meta("og:image"),
      };
    });

    const links = await page.evaluate(() =>
      Array.from(new Set(Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href))).slice(0, 200),
    );

    const cleanedHtml = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "");

    return {
      markdown: toMarkdownFromHtml(cleanedHtml),
      html: cleanedHtml,
      metadata: {
        title: metadata.title,
        description: metadata.description,
        ogImage: metadata.ogImage,
        statusCode: response?.status() ?? 0,
        sourceURL: page.url(),
      },
      links,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function createSessionId(): string {
  return `scrape_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

type ScrapeSessionRecord = {
  scrapeId: string;
  sourceUrl: string;
  currentUrl: string;
  createdAt: number;
  lastUsedAt: number;
  status: SessionStatus;
  lastAction?: string;
  storageState?: StoredStorageState;
};

async function saveSessionRecord(record: ScrapeSessionRecord): Promise<void> {
  await cacheService.set(sessionKey(record.scrapeId), record, SESSION_REGISTRY_TTL_SECONDS);
}

async function loadSessionRecord(scrapeId: string): Promise<ScrapeSessionRecord | null> {
  const record = await cacheService.get<Partial<ScrapeSessionRecord>>(sessionKey(scrapeId));
  if (!record) return null;
  return {
    scrapeId: record.scrapeId ?? scrapeId,
    sourceUrl: record.sourceUrl ?? record.currentUrl ?? "",
    currentUrl: record.currentUrl ?? record.sourceUrl ?? "",
    createdAt: record.createdAt ?? Date.now(),
    lastUsedAt: record.lastUsedAt ?? Date.now(),
    status: record.status ?? "checkpointed",
    lastAction: record.lastAction,
    storageState: record.storageState,
  };
}

async function deleteSessionRecord(scrapeId: string): Promise<void> {
  await cacheService.invalidate(sessionKey(scrapeId));
}

async function snapshotSession(scrapeId: string, session: LiveScrapeSession, patch: Partial<ScrapeSessionRecord> = {}): Promise<void> {
  const storageState = await session.context.storageState().catch(() => undefined);
  await saveSessionRecord({
    scrapeId,
    sourceUrl: patch.sourceUrl ?? session.page.url(),
    currentUrl: patch.currentUrl ?? session.page.url(),
    createdAt: session.createdAt,
    lastUsedAt: patch.lastUsedAt ?? Date.now(),
    status: patch.status ?? "checkpointed",
    lastAction: patch.lastAction,
    storageState,
  });
}

async function createLiveSession(record: ScrapeSessionRecord): Promise<LiveScrapeSession> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1600 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    storageState: record.storageState ?? undefined,
  });
  const page = await context.newPage();
  await protectPage(page);
  await page.goto(record.currentUrl || record.sourceUrl, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
  return {
    context,
    page,
    createdAt: record.createdAt,
    lastUsedAt: Date.now(),
  };
}

async function getLiveSession(scrapeId: string): Promise<{ session: LiveScrapeSession; record: ScrapeSessionRecord }> {
  pruneSessions();
  const existing = pageSessions.get(scrapeId);
  if (existing) {
    const record = (await loadSessionRecord(scrapeId)) ?? {
      scrapeId,
      sourceUrl: existing.page.url(),
      currentUrl: existing.page.url(),
      createdAt: existing.createdAt,
      lastUsedAt: existing.lastUsedAt,
      status: "active" as const,
      storageState: undefined,
    };
    return { session: existing, record };
  }

  const record = await loadSessionRecord(scrapeId);
  if (!record) throw new Error("Session not found or expired.");

  const session = await createLiveSession({ ...record, status: "rehydrating" });
  pageSessions.set(scrapeId, session);
  await snapshotSession(scrapeId, session, { status: "restored", lastAction: "rehydrate" });
  return { session, record };
}

async function tryRehydrateSession(scrapeId: string): Promise<{ session: LiveScrapeSession; record: ScrapeSessionRecord } | null> {
  const record = await loadSessionRecord(scrapeId);
  if (!record) return null;

  try {
    const session = await createLiveSession({ ...record, status: "rehydrating" });
    pageSessions.set(scrapeId, session);
    await snapshotSession(scrapeId, session, { status: "restored", lastAction: "rehydrate" });
    return { session, record };
  } catch {
    await saveSessionRecord({
      ...record,
      status: "stale",
      lastAction: "rehydrate_failed",
      lastUsedAt: Date.now(),
    });
    return null;
  }
}

function pruneSessions() {
  const now = Date.now();
  for (const [id, session] of pageSessions) {
    if (now - session.lastUsedAt > SESSION_TTL_MS) {
      void snapshotSession(id, session, { status: "expired", lastAction: "pruned", lastUsedAt: now }).catch(() => {});
      void session.page.close().catch(() => {});
      void session.context.close().catch(() => {});
      pageSessions.delete(id);
    }
  }
}

setInterval(pruneSessions, 60_000).unref?.();

export async function openScrapeSession(url: string, waitForMs = 0): Promise<{ scrapeId: string } & ScrapeOutput> {
  const safeUrl = await validatePublicUrl(url);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1600 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  await protectPage(page);

  const response = await page.goto(safeUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
  if (waitForMs > 0) {
    await page.waitForTimeout(Math.min(waitForMs, 10_000));
  }
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

  const html = await page.content();
  const metadata = await page.evaluate(() => {
    const meta = (name: string) =>
      document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute("content") || "";
    return {
      title: document.title || "",
      description: meta("description") || meta("og:description"),
      ogImage: meta("og:image"),
    };
  });
  const links = await page.evaluate(() =>
    Array.from(new Set(Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href))).slice(0, 200),
  );

  const scrapeId = createSessionId();
  const createdAt = Date.now();
  const session = { context, page, createdAt, lastUsedAt: createdAt };
  pageSessions.set(scrapeId, session);
  await snapshotSession(scrapeId, session, { status: "active", lastAction: "open", sourceUrl: page.url(), currentUrl: page.url(), lastUsedAt: createdAt });

  return {
    scrapeId,
    markdown: toMarkdownFromHtml(html),
    html,
    metadata: {
      title: metadata.title,
      description: metadata.description,
      ogImage: metadata.ogImage,
      statusCode: response?.status() ?? 0,
      sourceURL: page.url(),
    },
    links,
  };
}

export async function interactWithScrapeSession(scrapeId: string, prompt: string) {
  const live = await tryRehydrateSession(scrapeId);
  if (!live) {
    const record = await loadSessionRecord(scrapeId);
    const error = new Error(record ? "Unable to restore session. Start a new browser?" : "Session not found or expired.");
    (error as Error & { recoverable?: boolean }).recoverable = Boolean(record);
    throw error;
  }

  const { session } = live;
  const page = session.page;
  session.lastUsedAt = Date.now();
  const lower = prompt.toLowerCase();

  const checkpoint = async (lastAction: string) => {
    session.lastUsedAt = Date.now();
    await snapshotSession(scrapeId, session, {
      status: "checkpointed",
      lastAction,
      lastUsedAt: session.lastUsedAt,
    });
  };

  if (lower.includes("scroll")) {
    await page.mouse.wheel(0, 1200);
    await checkpoint("scroll");
    return { output: "Scrolled page.", html: await page.content(), text: await page.locator("body").innerText().catch(() => "") };
  }

  if (lower.includes("click")) {
    const targetText = prompt.split(/click/i).pop()?.trim().replace(/^["'`]|["'`]$/g, "") || "";
    if (targetText) {
      await page.getByText(targetText, { exact: false }).first().click({ timeout: 5000 });
      await checkpoint("click");
      return { output: `Clicked ${targetText}.`, html: await page.content(), text: await page.locator("body").innerText().catch(() => "") };
    }
  }

  if (lower.includes("fill")) {
    const parts = prompt.split(/fill/i).pop()?.split(/with/i) ?? [];
    const field = (parts[0] || "").trim();
    const value = (parts[1] || "").trim();
    if (field && value) {
      await page.getByLabel(field, { exact: false }).fill(value).catch(async () => {
        await page.locator(`input[placeholder*="${field}" i], textarea[placeholder*="${field}" i]`).first().fill(value);
      });
      await checkpoint("fill");
      return { output: `Filled ${field}.`, html: await page.content(), text: await page.locator("body").innerText().catch(() => "") };
    }
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  await checkpoint("extract");
  return { output: bodyText.slice(0, 4000), html: await page.content(), text: bodyText };
}

export async function closeScrapeSession(scrapeId: string): Promise<boolean> {
  await deleteSessionRecord(scrapeId);
  const session = pageSessions.get(scrapeId);
  if (!session) return false;
  await session.page.close().catch(() => {});
  await session.context.close().catch(() => {});
  pageSessions.delete(scrapeId);
  return true;
}

export async function getScrapeSessionStatus(scrapeId: string): Promise<ScrapeSessionRecord | null> {
  const live = pageSessions.get(scrapeId);
  if (live) {
    const record = (await loadSessionRecord(scrapeId)) ?? {
      scrapeId,
      sourceUrl: live.page.url(),
      currentUrl: live.page.url(),
      createdAt: live.createdAt,
      lastUsedAt: live.lastUsedAt,
      status: "active" as const,
      storageState: undefined,
    };
    return {
      ...record,
      currentUrl: live.page.url(),
      lastUsedAt: live.lastUsedAt,
      status: "active",
    };
  }
  return await loadSessionRecord(scrapeId);
}

export async function restoreScrapeSession(scrapeId: string): Promise<ScrapeSessionRecord> {
  const live = pageSessions.get(scrapeId);
  if (live) {
    const record = await loadSessionRecord(scrapeId);
    if (record) return record;
  }

  const record = await loadSessionRecord(scrapeId);
  if (!record) throw new Error("Session not found or expired.");

  const restored = await tryRehydrateSession(scrapeId);
  if (!restored) throw new Error("Unable to restore session. Start a new browser?");
  return await getScrapeSessionStatus(scrapeId).then((value) => value ?? record);
}

export async function scrapeWithRetry(url: string, waitForMs = 0): Promise<ScrapeOutput> {
  try {
    return await scrapeOnce(url, waitForMs);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("timeout") || message.includes("net::") || message.includes("blocked")) {
      return await scrapeOnce(url, waitForMs);
    }
    throw error;
  }
}
