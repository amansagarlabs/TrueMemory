export const sections: Record<string, [string, string]> = {
  overview: ["Developer overview", "Your memory infrastructure, at a glance."],
  playground: ["Playground", "Explore retrieval and inspect the context your agents receive."],
  documents: ["Documents", "The source material behind your memory layer."],
  tags: ["Container tags", "Isolate context by project, user, or environment."],
  graph: ["Memory graph", "Explore how sources, memories, and agents connect."],
  requests: ["Requests", "Every API call, with timing, status, and a trace you can inspect."],
  insights: ["User insights", "Understand how applications retrieve and use context."],
  connectors: ["Connectors", "Bring your tools and knowledge into a shared memory layer."],
  import: ["Import", "Stage source files and URLs for your memory pipeline."],
  "api-keys": ["API keys", "Manage credentials for your applications and agents."],
  agents: ["Agents & SDKs", "Connect your tools through the TrueMemory API or MCP."],
  health: ["System health", "Service availability, response times, and operational history."],
  incidents: ["Incidents", "Track impact, response, and recovery in one place."],
  team: ["Team", "Workspace members, roles, and access."],
  billing: ["Usage & billing", "Monitor consumption and plan capacity."],
  settings: ["Settings", "Configure your developer workspace."],
};
export const documents = [
  { id: "doc_8f21", title: "Agent onboarding guide", tag: "support-agent", memories: 24, status: "Indexed", time: "12 minutes ago" },
  { id: "doc_7b04", title: "Product architecture decisions", tag: "engineering", memories: 42, status: "Indexed", time: "38 minutes ago" },
  { id: "doc_3a18", title: "Customer preferences", tag: "personal-assistant", memories: 18, status: "Indexed", time: "1 hour ago" },
  { id: "doc_2c90", title: "September release notes", tag: "engineering", memories: 0, status: "Processing", time: "2 hours ago" },
];
export const requests = Array.from({ length: 18 }, (_, i) => ({ id: `req_${["a81f", "c239", "b40d", "e6f2", "d70b", "f902"][i % 6]}${i.toString().padStart(3, "0")}`, type: ["search", "add", "profile"][i % 3], path: ["/v1/memories/search", "/v1/memories", "/v1/profile"][i % 3], status: i === 4 ? 429 : i === 11 ? 500 : 200, duration: [126, 641, 11, 292, 42, 96][i % 6], tag: ["support-agent", "engineering", "personal-assistant"][i % 3], minutes: i * 7 + 2 }));
export const services = ["Memory API", "Semantic search", "Ingestion pipeline", "MCP gateway", "Connectors", "Developer console"];
export const incidents = [
  { id: "INC-024", title: "Elevated ingestion latency", status: "Monitoring", severity: "Minor", service: "Ingestion pipeline", date: "Sep 11, 2026", duration: "32 min", updates: [["14:32", "Monitoring", "Queue depth has returned to baseline. Monitoring processing latency before resolving."], ["14:18", "Identified", "A backlog in the ingestion worker pool caused delayed document processing."], ["14:00", "Investigating", "Investigating increased processing times. Memory reads are unaffected."]] },
  { id: "INC-023", title: "Search error rate increased", status: "Resolved", severity: "Major", service: "Semantic search", date: "Sep 06, 2026", duration: "18 min", updates: [["09:48", "Resolved", "Search traffic has recovered and error rates remain at baseline."], ["09:38", "Identified", "An index rollout caused errors on a subset of requests. The rollout was reverted."], ["09:30", "Investigating", "Investigating increased search errors."]] },
  { id: "INC-022", title: "Connector sync delays", status: "Resolved", severity: "Minor", service: "Connectors", date: "Aug 29, 2026", duration: "24 min", updates: [["11:24", "Resolved", "All pending sync jobs completed successfully."], ["11:00", "Investigating", "Connector syncs are taking longer than expected."]] },
];
