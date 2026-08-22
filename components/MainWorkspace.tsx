"use client";

import { useCallback, useEffect, useState } from "react";
import { DocumentInfo } from "@/components/DocumentInfo";
import { PdfUpload } from "@/components/PdfUpload";
import { PipelineViewer } from "@/components/PipelineViewer";
import { PipelineVisualizer } from "@/components/PipelineVisualizer";
import { ChatPanel } from "@/components/ChatPanel";
import type { PipelineStepId, UploadResponse } from "@/lib/types";
import {
  loadDocument,
  loadPipelineSteps,
  saveDocument,
  savePipelineSteps,
} from "@/lib/storage";
import { checkBackendHealth } from "@/services/api";

export function MainWorkspace() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [zillizOk, setZillizOk] = useState(false);
  const [openrouterOk, setOpenrouterOk] = useState(false);
  const [document, setDocument] = useState<UploadResponse | null>(() =>
    loadDocument(),
  );
  const [completedSteps, setCompletedSteps] = useState<Set<PipelineStepId>>(() =>
    loadPipelineSteps(),
  );

  useEffect(() => {
    checkBackendHealth()
      .then((data) => {
        setBackendOk(data.status === "ok");
        setZillizOk(data.zilliz_configured);
        setOpenrouterOk(data.openrouter_configured);
      })
      .catch(() => setBackendOk(false));
  }, []);

  const onUploaded = useCallback((doc: UploadResponse) => {
    setDocument(doc);
    saveDocument(doc);
    const steps = new Set<PipelineStepId>(["upload"]);
    setCompletedSteps(steps);
    savePipelineSteps([...steps]);
  }, []);

  const onStepsUpdate = useCallback((steps: Set<PipelineStepId>) => {
    setCompletedSteps(steps);
    savePipelineSteps([...steps]);
  }, []);

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Learning workspace
        </h2>
        <p className="text-sm text-zinc-500">
          Upload files, images, or links · Pipeline · Metrics · Chat (built step by step)
        </p>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            System status
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <StatusDot ok={backendOk} />
              Backend (FastAPI :8000) â€”{" "}
              {backendOk === null
                ? "checkingâ€¦"
                : backendOk
                  ? "connected"
                  : "start: cd backend && uvicorn main:app --reload"}
            </li>
            <li className="flex items-center gap-2">
              <StatusDot ok={zillizOk} />
              Zilliz Cloud â€”{" "}
              {zillizOk
                ? "MILVUS_* set in .env"
                : "add MILVUS_ADDRESS + MILVUS_TOKEN to my-ai-app/.env"}
            </li>
            <li className="flex items-center gap-2">
              <StatusDot ok={openrouterOk} />
              OpenRouter â€”{" "}
              {openrouterOk
                ? "API key configured"
                : "add OPENROUTER_API_KEY to my-ai-app/.env"}
            </li>
          </ul>
        </section>

        <PdfUpload onUploaded={onUploaded} disabled={backendOk === false} />

        {document && <DocumentInfo document={document} />}

        {document && (
          <PipelineVisualizer
            document={document}
            completedSteps={completedSteps}
            onStepsUpdate={onStepsUpdate}
            autoRun
          />
        )}

        <PipelineViewer completedSteps={completedSteps} />

        {document ? (
          <ChatPanel
            document={document}
            pipelineReady={
              completedSteps.has("ready") || completedSteps.has("milvus")
            }
            openrouterConfigured={openrouterOk}
          />
        ) : (
          <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              AI chat
            </h3>
            <p className="mt-2 text-sm text-zinc-500">
              Upload a file and run the pipeline to enable chat.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

function StatusDot({ ok }: { ok: boolean | null }) {
  const color =
    ok === null ? "bg-zinc-300" : ok ? "bg-emerald-500" : "bg-red-500";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

