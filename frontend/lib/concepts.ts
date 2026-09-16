/**
 * Sidebar learning content — each concept maps to a pipeline stage.
 * WHY: Static educational copy keeps the UI teachable without backend calls.
 */

export type Concept = {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  pipelineStage: string;
};

export const CONCEPTS: Concept[] = [
  {
    id: "tokenization",
    title: "Tokenization",
    summary: "Text is split into tokens — the units models actually read and bill for.",
    whyItMatters: "Token count drives cost, speed, and context limits.",
    pipelineStage: "After chunking → before embedding & LLM",
  },
  {
    id: "chunking",
    title: "Chunking",
    summary: "Long PDF text is cut into smaller overlapping pieces.",
    whyItMatters: "Models can't fit whole books; chunks make retrieval precise.",
    pipelineStage: "After PDF extraction",
  },
  {
    id: "embeddings",
    title: "Embeddings",
    summary: "Each chunk becomes a numeric vector capturing meaning.",
    whyItMatters: "Similar questions find similar chunks via vector math.",
    pipelineStage: "After chunking → stored in Milvus",
  },
  {
    id: "vector-db",
    title: "Vector DB",
    summary: "A database optimized for similarity search on vectors.",
    whyItMatters: "Millisecond retrieval over millions of chunks.",
    pipelineStage: "Stores all chunk embeddings",
  },
  {
    id: "milvus",
    title: "Milvus / Zilliz",
    summary: "Milvus is the open-source vector DB; Zilliz Cloud hosts it for you.",
    whyItMatters: "No Docker needed — same API as production.",
    pipelineStage: "Insert on upload; search on question",
  },
  {
    id: "retrieval",
    title: "Retrieval",
    summary: "Your question embedding finds the top-K closest chunks.",
    whyItMatters: "Only relevant context goes to the LLM — not the whole PDF.",
    pipelineStage: "On every chat message",
  },
  {
    id: "rag",
    title: "RAG",
    summary: "Retrieval-Augmented Generation — retrieve facts, then generate answer.",
    whyItMatters: "Reduces hallucination; grounds answers in your PDF.",
    pipelineStage: "Retrieve → prompt → OpenRouter",
  },
  {
    id: "prompt-injection",
    title: "Prompt Injection",
    summary: "Malicious text in a PDF trying to hijack model behavior.",
    whyItMatters: "Production systems sanitize and bound untrusted context.",
    pipelineStage: "Risk when injecting retrieved chunks",
  },
  {
    id: "context-window",
    title: "Context Windows",
    summary: "Max tokens the model can see at once (system + chunks + question).",
    whyItMatters: "Too many chunks get truncated — retrieval quality matters.",
    pipelineStage: "Final prompt assembly before LLM",
  },
];

export const PIPELINE_STEPS = [
  { id: "upload", label: "PDF Uploaded", done: false },
  { id: "extract", label: "Text Extracted", done: false },
  { id: "chunk", label: "Chunking Complete", done: false },
  { id: "tokenize", label: "Tokenization Complete", done: false },
  { id: "embed", label: "Embeddings Generated", done: false },
  { id: "milvus", label: "Stored in Milvus", done: false },
  { id: "ready", label: "Retrieval Ready", done: false },
] as const;
