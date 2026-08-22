# Aman Agent Lab PRD

## Document Purpose
This PRD translates the product strategy in [CONTENT.md](/D:/aman/my-ai-app/references/CONTENT.md) into implementation-facing requirements.

This is the primary product requirements document for Aman Agent Lab.

## Product Summary
Aman Agent Lab is a 100% open-source personal AI memory and workspace platform.

The product begins as a memory-first workspace and evolves toward a personal AI operating system with trusted actions, workflows, and bounded autonomy.

It should not be framed as a chatbot with memory.

## Product Vision
Primary goal:

"My AI remembers everything I've worked on and can help me instantly."

Long-term north star:

"The system that remembers what I know, understands what I am doing, and helps me get work done automatically."

## Product Positioning
Aman Agent Lab should be positioned as:
- a memory-rich AI workspace
- a grounded context system
- an open-source platform for trusted AI workflows
- a future personal AI operating system

It should not be positioned as:
- a generic chatbot
- a flashy autonomous agent demo
- a black-box automation layer

Evolution path:
- knowledge
- memory
- context
- actions
- workflows
- agents
- personal AI operating system

## Primary Users
- developers
- technical founders
- researchers
- knowledge workers
- solo operators
- small technical teams

## Core User Problems
- losing context across sessions
- forgetting prior work and decisions
- re-explaining the same project repeatedly
- fragmented artifacts across tools
- weak continuity between chat, documents, and projects
- too much manual coordination for repeated knowledge work

## Product Goals

### Goal 1: Durable Memory
The system should preserve and retrieve useful work context across sessions.

### Goal 2: Context Assembly
The system should understand active projects, recent work, and relevant artifacts well enough to help without constant reprompting.

### Goal 3: Trusted Actions
The system should eventually use tools safely with visibility and approval.

### Goal 4: Workflow Capability
The system should support multi-step knowledge workflows across tools and artifacts.

### Goal 5: Safe Autonomy
The system should only expand autonomy when actions are traceable, reviewable, and reversible.

## Product Phases

Suggested narrative:
- Phase 1: Personal Memory Workspace
- Phase 2: Personal Knowledge System
- Phase 3: Personal AI Assistant
- Phase 4: Personal AI Worker
- Phase 5: Personal AI Operating System

### Phase 1: Memory Workspace
Must include:
- chat with retrieval-backed answers
- artifact ingestion
- PDF support
- persistent history
- saved memory
- searchable knowledge
- source-linked outputs

Should include:
- project grouping
- artifact summaries
- timeline-aware recall

Must not prioritize:
- autonomous execution
- background agents unrelated to memory quality
- flashy automation

### Phase 2: Tool Usage
Must include:
- tool invocation model
- approval checkpoints
- action logs
- connector permissions
- artifact creation from tool outputs

### Phase 3: Workflow Automation
Must include:
- workflow definitions
- multi-step execution
- scheduling
- background runs
- retries
- result artifacts
- run histories

### Phase 4: Semi-Autonomous Agents
Must include:
- checkpointed execution
- run supervision
- bounded task objectives
- policy-aware planning
- human review surfaces

### Phase 5: Personal AI Operating System
Must include:
- persistent workspace memory
- wide MCP coverage
- cross-tool workflows
- CLI and headless execution
- user-defined autonomy policies

## MVP Requirements

### Functional Requirements
- Users must be able to chat with grounded retrieval.
- Users must be able to upload and process PDFs or artifacts.
- Users must be able to search prior context.
- The system must persist recent and durable memory.
- Answers must expose enough provenance to support trust.
- The workspace must support project-oriented organization over time.

### Non-Functional Requirements
- The system must feel transparent.
- The system must be auditable.
- The system must prioritize reliability over novelty.
- The product must preserve user trust when confidence is low.

## Long-Term Architecture Requirements
The platform should evolve to support:
- RAG
- long-term memory
- knowledge graphs
- artifacts
- tool calling
- MCP servers
- workflow orchestration
- background jobs
- task scheduling
- CLI access
- headless execution
- multi-step planning
- human approval gates

## AI-Native Product Evaluation
Repository and architecture reviews should evaluate whether the system can grow into a personal AI operating system, not just a richer chat interface.

Review questions:
1. Does the architecture support long-term memory?
2. Does the architecture support retrieval across all user artifacts?
3. Can the system understand user context across time?
4. Can the system evolve into tool usage?
5. Can the system evolve into workflow execution?
6. Can the system evolve into autonomous agents?
7. Can the system evolve into a personal AI operating system?

## MCP Requirements

### MVP MCP Priorities
- Filesystem
- GitHub
- documentation systems
- local artifacts
- basic database access

### Phase 2 MCP Priorities
- Notion
- Google Drive
- GitLab
- Slack
- Email

### Phase 3 MCP Priorities
- cloud platforms
- Discord
- advanced database environments
- monitoring systems
- internal documentation platforms

## CLI Requirements
The CLI should eventually become a first-class interface.

Initial target capabilities:
- `aman memory search "query"`
- `aman summarize ./documents`
- `aman analyze ./project`
- `aman scan ./repository`

Later capabilities:
- `aman watch https://example.com`
- `aman research "topic"`
- scheduled and headless workflows

The future user experience must not depend entirely on clicking UI elements.

Supported interaction modes should eventually include:
- web UI
- CLI
- chat
- voice
- API
- scheduled jobs
- background agents
- MCP clients

## Autonomy Rules
Autonomous behavior must never outrun trust.

Every action system should be:
- traceable
- reviewable
- reversible

The product must favor:
- transparency
- memory quality
- approval gates
- recoverability
- human oversight

The product filter for new features should be:

"Does this help Aman Agent Lab become a trusted personal AI operating system?"

## Success Criteria

### Phase 1 Success
- users can recover useful context quickly
- answers are grounded in artifacts and history
- memory feels persistent and useful

### Phase 2 Success
- users can safely delegate single actions
- tool use is visible and inspectable

### Phase 3 Success
- repeatable workflows save meaningful time
- scheduled runs create reliable artifacts

### Phase 4 Success
- agents can complete bounded objectives with checkpoints

### Phase 5 Success
- Aman Agent Lab behaves like a trusted AI operating layer across a user's work

## Document Relationship
This PRD should stay aligned with:
- [CONTENT.md](/D:/aman/my-ai-app/references/CONTENT.md) for product direction
- [DESIGN.md](/D:/aman/my-ai-app/references/DESIGN.md) for visual rules
- [SKILL.md](/D:/aman/my-ai-app/references/SKILL.md) for future implementation prompts

## Documentation Requirement
Important context must not live only in conversation threads.

When product, architecture, workflow, or autonomy decisions change, the repository should add or update `.md` files so the project remains self-describing.

Minimum required context docs:
- `references/CONTENT.md`
- `references/PRD.md`
- `references/DESIGN.md`
- `references/SKILL.md`

Recommended future docs as complexity grows:
- `references/ARCHITECTURE.md`
- `references/MCP.md`
- `references/CLI.md`
- `references/WORKFLOWS.md`
- `references/MEMORY.md`
- `references/AUTONOMY.md`
