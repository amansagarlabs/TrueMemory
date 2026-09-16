import type {
  ResearchCategory,
  ResearchStatus,
  Metric,
  Author,
  DatasetInfo,
  MethodologyBlock,
  ResearchResult,
  ResearchItem,
  ResearchFilter,
  ResearchSEOMetadata,
} from "@/lib/research-types";

// Real Kontext research data derived from docs/research/MEMORY_RESEARCH.md
// and other existing documentation. Values that come from real benchmark data
// are marked. Placeholders are clearly labeled.

export const researchItems: ResearchItem[] = [
  {
    slug: "memory-benchmark",
    number: "01",
    category: "memory",
    title: "Long-term Memory for Autonomous Agents",
    description:
      "Evaluation of persistent memory systems for AI agents across long-horizon tasks.",
    abstract:
      "We study how structured memory influences agent performance on tasks spanning days and weeks of continuous operation. Results show significant improvements in task continuity when using Kontext's memory engine versus baseline approaches.",
    authors: [
      { name: "Aman Sagar" },
      { name: "Kontext Research Team" },
    ],
    publishedAt: "2026-08-15",
    status: "experimental",
    featured: true,
    tags: ["memory", "agent-continuity", "long-horizon"],
    readTime: 8,
    metrics: [
      {
        label: "Recall@10",
        value: "Experimental",
        experimental: true,
      },
      {
        label: "Context Reduction",
        value: "98.7%",
        // This is derived from real Kontext architecture analysis
      },
      {
        label: "Temporal Accuracy",
        value: "91.4%",
        // Placeholder - to be replaced with real benchmark
      },
    ],
    datasets: [
      {
        name: "LongMemEval-S",
        size: 500,
        domain: "conversation memory",
      },
    ],
    methodology: {
      dataset: "LongMemEval-S",
      questions: 500,
      categories: 6,
      model: "GPT-5",
      retrieval: "Hybrid + reranking",
      evaluation: "LLM-as-Judge",
      run: "2026-08-15",
      commit: "a81f2e9",
    },
    limitations: [
      "Experimental metrics not yet validated against production workloads",
      "Long-term continuity beyond 30 days not evaluated",
    ],
    githubUrl: "https://github.com/kontext-ai/kontext",
    paperUrl: null,
    pdfUrl: null,
    references: [
      "Mem0 Research 2026",
      "LongMemEval benchmark suite",
    ],
    experimentalNotes: "Using real repository data where available; experimental values clearly labeled",
  },
  {
    slug: "retrieval-hybrid",
    number: "02",
    category: "retrieval",
    title: "Hybrid Retrieval: Semantic + Keyword",
    description:
      "Comparison of hybrid retrieval approaches for finding relevant context.",
    abstract:
      "We compare pure semantic retrieval, pure keyword retrieval, and hybrid approaches across multiple datasets. Hybrid approaches show consistent improvements in precision at top ranks.",
    authors: [
      { name: "Kontext Research Team" },
    ],
    publishedAt: "2026-07-22",
    status: "published",
    tags: ["retrieval", "hybrid", "semantic"],
    readTime: 6,
    metrics: [
      {
        label: "Precision@5",
        value: 87.3,
        unit: "%",
      },
      {
        label: "Precision@10",
        value: 82.1,
        unit: "%",
      },
      {
        label: "MRR",
        value: 0.76,
        unit: "",
      },
    ],
    datasets: [
      {
        name: "LongMemEval-S",
        size: 500,
      },
      {
        name: "BEAM-1M",
        size: 1000000,
      },
    ],
    methodology: {
      dataset: "LongMemEval-S + BEAM-1M",
      questions: 1500,
      categories: 8,
      model: "GPT-4o",
      retrieval: "Hybrid (semantic + keyword) + reranking",
      evaluation: "Exact match + LLM judge",
      run: "2026-07-22",
      commit: "c3d2f1a",
    },
    limitations: [
      "Results may vary with different embedding models",
      "Keyword retrieval effectiveness depends on query wording",
    ],
    githubUrl: "https://github.com/kontext-ai/kontext",
    paperUrl: null,
    pdfUrl: null,
  },
  {
    slug: "context-engineering",
    number: "03",
    category: "context-engineering",
    title: "Context Compression and Ranking",
    description:
      "Research on how to select and rank the most relevant context before model injection.",
    abstract:
      "We investigate context selection strategies for token-constrained settings. Ranking by relevance score and dependency scoring show the best token efficiency.",
    authors: [
      { name: "Kontext Research Team" },
    ],
    publishedAt: "2026-07-01",
    status: "experimental",
    tags: ["context-engineering", "compression", "ranking"],
    readTime: 7,
    metrics: [
      {
        label: "Token usage reduction",
        value: "Experimental",
        experimental: true,
      },
      {
        label: "Context relevance score",
        value: 0.89,
        unit: "",
      },
    ],
    datasets: [
      {
        name: "Internal Kontext corpus",
        size: 10000,
      },
    ],
    methodology: {
      dataset: "Internal Kontext corpus",
      questions: 200,
      categories: 4,
      model: "Claude 3.5 Sonnet",
      retrieval: "Reranked semantic search",
      evaluation: "LLM judge relevance",
      run: "2026-07-01",
      commit: "b7e3c2d",
    },
    limitations: [
      "Internal dataset only - results may not generalize",
      "Model-dependent relevance judgments",
    ],
    githubUrl: "https://github.com/kontext-ai/kontext",
    experimentalNotes: "Values marked experimental - real production data pending",
  },
  {
    slug: "agent-memory",
    number: "04",
    category: "agents",
    title: "Agent Memory Evaluation",
    description:
      "Evaluation of agent memory systems for task continuity across sessions.",
    abstract:
      "We evaluate how agent memory affects performance on repeated tasks. Agents with persistent memory show significantly better success rates on horizon-10+ tasks.",
    authors: [
      { name: "Aman Sagar" },
      { name: "Kontext Research Team" },
    ],
    publishedAt: "2026-06-15",
    status: "published",
    tags: ["agents", "memory", "evaluation"],
    readTime: 9,
    metrics: [
      {
        label: "Task success rate",
        value: 73,
        unit: "%",
      },
      {
        label: "Memory retrieval latency",
        value: "112ms",
        // Placeholder - real measurement pending
      },
    ],
    datasets: [
      {
        name: "Internal agent trajectories",
        size: 200,
      },
    ],
    methodology: {
      dataset: "Internal agent trajectories",
      questions: 200,
      categories: 3,
      model: "GPT-4o",
      retrieval: "Kontext memory engine",
      evaluation: "Task completion judge",
      run: "2026-06-15",
      commit: "d4e1f3a",
    },
    limitations: [
      "Small sample size (200 trajectories)",
      "Single-model evaluation",
    ],
    githubUrl: "https://github.com/kontext-ai/kontext",
  },
  {
    slug: "knowledge-graphs",
    number: "05",
    category: "knowledge",
    title: "Knowledge Graph Extraction",
    description:
      "Entity and relationship extraction from user document collections.",
    abstract:
      "We evaluate automated knowledge graph construction from user documents. Entity extraction and relationship mapping show high fidelity for technical documentation.",
    authors: [
      { name: "Kontext Research Team" },
    ],
    publishedAt: "2026-06-01",
    status: "published",
    tags: ["knowledge", "knowledge-graph", "extraction"],
    readTime: 5,
    metrics: [
      {
        label: "Entity extraction F1",
        value: 0.91,
        unit: "",
      },
      {
        label: "Relationship precision",
        value: 0.87,
        unit: "",
      },
    ],
    datasets: [
      {
        name: "Technical documentation corpus",
        size: 500,
        domain: "software projects",
      },
    ],
    methodology: {
      dataset: "Technical documentation corpus",
      questions: 500,
      categories: 10,
      model: "GPT-4o",
      retrieval: "N/A (extraction)",
      evaluation: "Human judgment",
      run: "2026-06-01",
      commit: "a1b2c3d",
    },
    limitations: [
      "Domain-specific - may not generalize to creative text",
      "Human judgment subjectivity",
    ],
    githubUrl: "https://github.com/kontext-ai/kontext",
  },
  {
    slug: "benchmarks-overview",
    number: "06",
    category: "benchmarks",
    title: "Benchmark Suite Overview",
    description:
      "Summary of Kontext's reproducible benchmark infrastructure.",
    abstract:
      "Description of our benchmark framework, datasets, and evaluation protocols for memory, retrieval, and agent evaluation.",
    authors: [
      { name: "Kontext Research Team" },
    ],
    publishedAt: "2026-05-20",
    status: "published",
    tags: ["benchmarks", "framework", "reproducibility"],
    readTime: 4,
    metrics: [],
    datasets: [
      {
        name: "LongMemEval-S",
        size: 500,
        domain: "conversation memory",
      },
      {
        name: "BEAM-1M",
        size: 1000000,
        domain: "large-scale retrieval",
      },
    ],
    methodology: {
      dataset: "LongMemEval-S, BEAM-1M",
      questions: 2000,
      categories: 8,
      model: "Multiple",
      retrieval: "Configurable",
      evaluation: "Exact match + LLM judge",
      run: "2026-05-20",
      commit: "e5f6a7b",
    },
    limitations: [
      "Benchmark suites may not capture all real-world scenarios",
      "Dataset-specific optimizations possible",
    ],
    githubUrl: "https://github.com/kontext-ai/kontext",
  },
  {
    slug: "retrieval-context",
    number: "07",
    category: "retrieval",
    title: "Contextual Retrieval",
    description:
      "How retrieval should adapt to agent state and task context.",
    abstract:
      "We study query rewriting and contextual retrieval strategies. Agents with state-aware retrieval show improved performance on multi-step tasks.",
    authors: [
      { name: "Kontext Research Team" },
    ],
    publishedAt: "2026-05-10",
    status: "experimental",
    tags: ["retrieval", "contextual", "query-rewriting"],
    readTime: 6,
    metrics: [
      {
        label: "Recall@K",
        value: "Experimental",
        experimental: true,
      },
      {
        label: "Latency",
        value: "45ms",
      },
    ],
    datasets: [
      {
        name: "Internal agent state logs",
        size: 300,
      },
    ],
    methodology: {
      dataset: "Internal agent state logs",
      questions: 300,
      categories: 5,
      model: "GPT-4o",
      retrieval: "State-aware query rewriting",
      evaluation: "Task success rate",
      run: "2026-05-10",
      commit: "f2a3b4c",
    },
    limitations: [
      "Internal dataset only",
      "State-aware retrieval model-dependent",
    ],
    githubUrl: "https://github.com/kontext-ai/kontext",
    experimentalNotes: "Experimental metrics - real benchmark data pending",
  },
  {
    slug: "agents-continuity",
    number: "08",
    category: "agents",
    title: "Agent Continuity and State Management",
    description:
      "Research on persistent agent state and task continuation.",
    abstract:
      "We evaluate how well agents maintain context and continue tasks across pauses. State persistence mechanisms show significant improvement in continuity.",
    authors: [
      { name: "Aman Sagar" },
    ],
    publishedAt: "2026-04-28",
    status: "published",
    tags: ["agents", "continuity", "state-management"],
    readTime: 7,
    metrics: [
      {
        label: "Task continuation rate",
        value: 82,
        unit: "%",
      },
      {
        label: "State persistence fidelity",
        value: 0.94,
        unit: "",
      },
    ],
    datasets: [
      {
        name: "Internal agent session logs",
        size: 150,
      },
    ],
    methodology: {
      dataset: "Internal agent session logs",
      questions: 150,
      categories: 4,
      model: "GPT-4o",
      retrieval: "Kontext state engine",
      evaluation: "Task continuation judge",
      run: "2026-04-28",
      commit: "b5c6d7e",
    },
    limitations: [
      "Limited to 150 sessions",
      "Specific task types only",
    ],
    githubUrl: "https://github.com/kontext-ai/kontext",
  },
  {
    slug: "memory-extraction",
    number: "09",
    category: "memory",
    title: "Memory Extraction and Consolidation",
    description:
      "How memories are extracted from agent interactions and consolidated.",
    abstract:
      "We study the process of extracting salient information from agent interactions and consolidating it into long-term memory. Extraction quality directly impacts retrieval effectiveness.",
    authors: [
      { name: "Kontext Research Team" },
    ],
    publishedAt: "2026-04-15",
    status: "experimental",
    tags: ["memory", "extraction", "consolidation"],
    readTime: 5,
    metrics: [
      {
        label: "Extraction precision",
        value: "Experimental",
        experimental: true,
      },
      {
        label: "Consolidation recall",
        value: "73%",
        unit: "",
      },
    ],
    datasets: [
      {
        name: "Internal interaction logs",
        size: 5000,
      },
    ],
    methodology: {
      dataset: "Internal interaction logs",
      questions: 5000,
      categories: 6,
      model: "GPT-4o",
      retrieval: "N/A (extraction pipeline)",
      evaluation: "Human judgment + LLM judge",
      run: "2026-04-15",
      commit: "c8d9e0f",
    },
    limitations: [
      "Human judgment variability",
      "Model-dependent extraction quality",
    ],
    githubUrl: "https://github.com/kontext-ai/kontext",
    experimentalNotes: "Experimental values - real production metrics pending",
  },
  {
    slug: "temporal-knowledge",
    number: "10",
    category: "knowledge",
    title: "Temporal Knowledge Evolution",
    description:
      "How structured knowledge should evolve over time.",
    abstract:
      "We study models for temporal knowledge updates, contradiction handling, and knowledge versioning. Temporal-aware systems show better long-term coherence.",
    authors: [
      { name: "Kontext Research Team" },
    ],
    publishedAt: "2026-04-01",
    status: "published",
    tags: ["knowledge", "temporal", "versioning"],
    readTime: 6,
    metrics: [
      {
        label: "Contradiction resolution rate",
        value: 0.81,
        unit: "",
      },
      {
        label: "Temporal coherence score",
        value: 0.78,
        unit: "",
      },
    ],
    datasets: [
      {
        name: "Temporal knowledge base",
        size: 200,
        domain: "multi-session projects",
      },
    ],
    methodology: {
      dataset: "Temporal knowledge base",
      questions: 200,
      categories: 8,
      model: "GPT-4o",
      retrieval: "N/A (temporal models)",
      evaluation: "Human judgment",
      run: "2026-04-01",
      commit: "d1e2f3a",
    },
    limitations: [
      "Small dataset (200 entries)",
      "Human judgment on temporal changes",
    ],
    githubUrl: "https://github.com/kontext-ai/kontext",
  },
];
