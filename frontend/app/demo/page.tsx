import {
  Brain,
  CheckCircle2,
  Database,
  FileSearch,
  FileText,
  Globe2,
  MessageSquare,
  ShieldCheck,
  Upload,
  Zap,
} from "lucide-react";

const timeline = [
  {
    title: "Upload PDF",
    text: "Drag in a document and trigger extraction, chunking, and embeddings.",
    icon: Upload,
  },
  {
    title: "Search context",
    text: "The agent checks recent chat, saved memory, and matching artifact chunks.",
    icon: FileSearch,
  },
  {
    title: "Generate answer",
    text: "Grounded responses stream back with visible source-aware status updates.",
    icon: MessageSquare,
  },
  {
    title: "Persist memory",
    text: "Sessions, conversations, and reusable insights are stored for future turns.",
    icon: Database,
  },
];

export default function DemoPage() {
  return (
    <main className="demo-page min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.16),transparent_30%),linear-gradient(180deg,#020617_0%,#0f172a_42%,#111827_100%)] text-white">
      <div className="relative h-screen w-full p-5 sm:p-8">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/6 to-transparent" />
        <div className="mx-auto flex h-full max-w-6xl flex-col rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur sm:p-6">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2f6bff]">
                <Zap className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">Aman Agent Lab Walkthrough</p>
                <p className="text-xs text-slate-300">
                  Product story: upload, retrieve, answer, remember
                </p>
              </div>
            </div>
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              Guided demo
            </div>
          </div>

          <div className="grid flex-1 gap-5 pt-5 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#081226] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
                    Live workspace
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                    A grounded chat answer, step by step
                  </h1>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                  Demo loop
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <div className="demo-card-float rounded-[1.25rem] bg-[#2f6bff] p-4 shadow-[0_16px_34px_rgba(47,107,255,0.28)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100">
                      User request
                    </p>
                    <p className="mt-3 text-sm leading-7 text-white">
                      Summarize this PDF, check recent chat memory, and use web
                      search only if the document does not answer the question.
                    </p>
                  </div>

                  <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white p-4 text-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Agent response
                    </p>
                    <p className="mt-3 text-sm leading-7">
                      I found the answer directly in the uploaded document. I
                      also checked recent conversation memory for your preferred
                      reporting style. No web fallback was needed.
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {[
                      ["Artifacts", "Chunk matches 12"],
                      ["Memory", "Preference found"],
                      ["Web", "Skipped"],
                    ].map(([label, value], index) => (
                      <div
                        key={label}
                        className="demo-stagger rounded-[1rem] border border-white/10 bg-white/5 p-3 text-sm"
                        style={{ animationDelay: `${index * 0.4}s` }}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                          {label}
                        </p>
                        <p className="mt-2 font-medium text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">
                      Agent event timeline
                    </p>
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 demo-pulse-dot" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {timeline.map((item, index) => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.title}
                          className="demo-stagger rounded-[1.15rem] border border-white/10 bg-slate-950/45 p-4"
                          style={{ animationDelay: `${index * 0.55}s` }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/15 text-blue-300">
                              <Icon className="h-4 w-4" />
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-white">
                                {item.title}
                              </p>
                              <p className="text-xs text-slate-300">
                                {item.text}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">
                    Search hierarchy in action
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    Observable workflow
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  {[
                    {
                      icon: FileText,
                      title: "Artifacts first",
                      text: "PDF chunks ranked for relevance before generation.",
                    },
                    {
                      icon: Brain,
                      title: "Memory second",
                      text: "Recent chats and saved preferences added to context.",
                    },
                    {
                      icon: Globe2,
                      title: "Web fallback",
                      text: "Live research runs only when local evidence is thin.",
                    },
                    {
                      icon: ShieldCheck,
                      title: "Source trace",
                      text: "Status events and source-aware answers stay visible.",
                    },
                  ].map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.title}
                        className="demo-stagger rounded-[1.15rem] border border-white/10 bg-slate-950/40 p-4"
                        style={{ animationDelay: `${index * 0.3}s` }}
                      >
                        <Icon className="h-5 w-5 text-blue-300" />
                        <p className="mt-3 text-sm font-semibold">{item.title}</p>
                        <p className="mt-2 text-xs leading-6 text-slate-300">
                          {item.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <aside className="flex flex-col gap-4">
              <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
                  Why this matters
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                  This is more than a chat box
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  Aman Agent Lab is shaped like a product system: auth,
                  documents, retrieval, memory, session history, and developer
                  ops all feed into one AI workspace.
                </p>
              </div>

              <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">
                  Powered by the app stack
                </p>
                <div className="mt-4 space-y-3">
                  {[
                    "Next.js frontend for the product surface",
                    "FastAPI backend for routes and orchestration",
                    "Milvus or Zilliz Cloud for vector retrieval",
                    "PostgreSQL for auth, sessions, and chat history",
                  ].map((item, index) => (
                    <div
                      key={item}
                      className="demo-stagger rounded-[1rem] border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-200"
                      style={{ animationDelay: `${index * 0.35}s` }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative flex-1 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(47,107,255,0.18)_0%,rgba(15,23,42,0.25)_100%)] p-4">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(147,197,253,0.22),transparent_42%)]" />
                <div className="relative flex h-full flex-col justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
                      Outcome
                    </p>
                    <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
                      Answers with receipts
                    </p>
                  </div>
                  <div className="rounded-[1.25rem] border border-white/10 bg-white/10 p-4 backdrop-blur">
                    <p className="text-sm leading-7 text-blue-50">
                      The walkthrough focuses on what users actually care about:
                      what the agent checked, where the answer came from, and
                      what context will still be available in the next turn.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
