# Aman Agent Lab

## Product Identity
Aman Agent Lab is not a job-search product.

Aman Agent Lab is a personal AI memory and workspace system designed to help a user remember what they have worked on, understand what matters now, and gradually take trusted action across tools and systems.

The product direction must stay distinct from the career-ops visual reference work. Career-ops is only a design language reference. Aman Agent Lab has its own product narrative, information architecture, feature roadmap, and long-term platform ambition.

## Open Source Position
Aman Agent Lab should be positioned as a 100% open-source product.

That means the product narrative should emphasize:
- open architecture
- inspectable behavior
- portable knowledge
- self-hostable foundations where practical
- transparent memory and action systems
- developer ownership of data and workflows

Open source should not be treated as a marketing badge only. It should shape product trust, extensibility, auditability, and adoption.

Core message:

"Aman Agent Lab is a 100% open-source AI memory and workspace platform that grows into a personal AI operating system."

## Companion Documents
This content file defines the product story, platform direction, autonomy boundaries, and long-term strategy.

Companion docs:
- `references/PRD.md`: product requirements and phased delivery framing
- `references/DESIGN.md`: visual and interaction system
- `references/SKILL.md`: design-system guidance for future implementation prompts

## Documentation Context Rule
Aman Agent Lab should always preserve important product, design, architecture, and workflow context in `.md` files inside the repository.

Chat history alone is not a durable source of truth.

When meaningful decisions are made, the repository should add or update Markdown documents so future contributors, agents, and workflows inherit the context.

At minimum, the project should keep these context files current:
- `references/CONTENT.md` for product direction
- `references/PRD.md` for product requirements
- `references/DESIGN.md` for design system rules
- `references/SKILL.md` for implementation guidance

As the project grows, new `.md` files should be added for:
- roadmap changes
- architecture decisions
- MCP strategy
- CLI plans
- workflow specifications
- memory model decisions
- autonomy policies

Rule:

"If a decision matters later, it should exist in a Markdown file."

## Core Product Vision
Primary goal:

"My AI remembers everything I've worked on and can help me instantly."

This starts as a memory-first workspace and evolves into a personal AI operating system.

North star:

"The system that remembers what I know, understands what I am doing, and helps me get work done automatically."

The product must feel:
- trustworthy
- grounded
- useful
- transparent
- memory-rich
- operationally safe

The product must not feel:
- gimmicky
- over-automated
- mysterious
- flashy for its own sake
- agentic without oversight

## What Aman Agent Lab Is
Aman Agent Lab is a workspace where a user can:
- store and retrieve long-term memory
- chat with grounded context
- search across documents, notes, projects, and history
- understand ongoing work and priorities
- orchestrate tools with approval
- build repeatable workflows
- eventually delegate bounded autonomous tasks

## AI-Native Product Framing
Aman Agent Lab should not be positioned as a chatbot with memory.

It should be positioned as:

"A Personal AI Operating System that starts with memory and evolves into autonomy."

Memory is not the final product.

Memory is the foundation layer.

The long-term progression should be:

Knowledge
-> Memory
-> Context
-> Actions
-> Workflows
-> Agents
-> Personal AI Operating System

The product story should emphasize:
- memory as infrastructure
- context as a working layer
- actions as supervised execution
- workflows as repeatable systems
- autonomy as a later outcome of trust and reliability

It should not emphasize:
- "chat" as the main identity
- disconnected AI features
- dashboards without execution loops
- autonomy before memory and context quality

## Product Progression

### Level 1: Memory
The AI remembers:
- files
- conversations
- links
- notes
- projects
- user knowledge
- working history
- prior decisions

User value:
- instant recall
- reduced repetition
- continuity across sessions
- better grounded answers

### Level 2: Context
The AI understands:
- what the user is working on now
- current priorities
- active projects
- historical work
- recurring patterns
- recent decisions
- project dependencies

User value:
- relevant responses
- fewer prompts needed
- stronger prioritization help
- better project continuity

### Level 3: Actions
The AI can take approved actions using tools and integrations.

Examples:
- open and summarize artifacts
- update notes
- create tasks
- fetch documentation
- inspect repositories
- collect links and evidence

User value:
- less manual overhead
- faster execution
- better coordination across systems

### Level 4: Workflows
The AI can execute multi-step tasks across multiple tools and systems.

Examples:
- gather daily research, summarize, and file it
- scan repositories, detect issues, and create recommendations
- monitor documentation changes and maintain a changelog
- combine meeting transcripts into action items and follow-ups

User value:
- repeated knowledge work becomes structured
- operational consistency improves
- the workspace becomes a system of execution, not just recall

### Level 5: Autonomous Agents
The AI can independently perform approved objectives with minimal human intervention.

Examples:
- research a topic daily and update artifacts
- monitor websites and generate reports
- analyze repositories and suggest improvements
- watch documentation changes
- track project progress
- generate weekly summaries
- create action items from meetings
- maintain knowledge bases automatically

User value:
- meaningful delegation
- compounding system value
- an AI workspace that becomes an AI operating system

## Product Roadmap

### Phase 1: Memory Workspace
Goal:
Build the strongest possible memory and workspace foundation.

Priorities:
- chat with grounded retrieval
- PDF and artifact ingestion
- persistent conversation history
- saved memory
- source citations
- project-oriented organization
- searchable knowledge store
- visible answer provenance

This phase should optimize for:
- trust
- grounded responses
- fast recall
- information continuity
- usability

This phase should not optimize for:
- flashy automation
- unsupervised tool execution
- autonomous background behavior

Suggested narrative:
- Phase 1: Personal Memory Workspace
- Phase 2: Personal Knowledge System
- Phase 3: Personal AI Assistant
- Phase 4: Personal AI Worker
- Phase 5: Personal AI Operating System

### Phase 2: Tool Usage
Goal:
Let the AI use tools safely in response to user requests.

Priorities:
- tool-calling layer
- MCP integration foundation
- approval UI for actions
- action logs
- artifact generation
- connector permissions model

This phase moves Aman Agent Lab from memory to assistive execution.

### Phase 3: Workflow Automation
Goal:
Support repeatable multi-step tasks across tools.

Priorities:
- workflow definitions
- background jobs
- task scheduling
- stateful workflow runs
- result artifacts
- retry and recovery logic
- audit history

This phase moves Aman Agent Lab from tool use to dependable automation.

### Phase 4: Semi-Autonomous Agents
Goal:
Allow bounded, approved agents to complete objectives with checkpoints.

Priorities:
- planning engine
- checkpoint approvals
- run supervision
- rollback-safe actions
- execution traces
- memory-backed agent context

This phase must preserve strong human oversight.

### Phase 5: Personal AI Operating System
Goal:
Turn Aman Agent Lab into a persistent, trusted AI operating layer across personal and professional work.

Priorities:
- deep memory integration
- broad MCP ecosystem
- autonomous routines with guardrails
- workspace-wide context graph
- user-defined operating policies
- always-available web + CLI + headless interfaces

## Product Principles

### Trust Over Spectacle
The product should prefer reliable, reviewable behavior over surprising automation.

### Transparency By Default
The user must be able to see:
- what the system knows
- where an answer came from
- what tools were used
- what actions were taken
- why a workflow made a decision

### Memory As The Core Primitive
Memory is not an add-on. It is the foundation for context, actions, workflows, and autonomy.

### Human Oversight
The user should remain in control of approvals, policies, boundaries, and recoverability.

### Auditability
Every meaningful action must be logged and inspectable.

### Recoverability
Failures must be resumable. Actions must be reversible wherever possible.

## Autonomous Action Standards
Every autonomous or semi-autonomous action should be:
- traceable
- reviewable
- reversible

This means the system should preserve:
- structured action logs
- approval records
- execution traces
- source references
- workflow state
- artifact history
- retry metadata

## Repository Evaluation Lens
When evaluating the repository, recommendations should be judged by whether they strengthen the path from:
- memory
- to context
- to actions
- to workflows
- to autonomous agents

Recommendations should explain:
1. what problem the change solves now
2. how it strengthens the memory workspace
3. how it prepares the system for later tool usage or automation
4. what trust, transparency, or safety benefit it adds

## YC AI-Native Product Evaluation
In addition to evaluating the repository against the Personal AI Memory + Workspace vision, evaluate it against the direction of AI-native products and autonomous agents.

Do not assume Aman Agent Lab is a chatbot.

Assume Aman Agent Lab is the foundation of a Personal AI Operating System.

When reviewing the repository, determine:
1. Does the architecture support long-term memory?
2. Does the architecture support retrieval across all user artifacts?
3. Can the system understand user context across time?
4. Can the system evolve into tool usage?
5. Can the system evolve into workflow execution?
6. Can the system evolve into autonomous agents?
7. Can the system evolve into a personal AI operating system?

For every feature, ask:

"Does this help Aman Agent Lab become a trusted personal AI operating system?"

If yes:
- keep or improve

If no:
- challenge the feature

## Architecture Direction

### The Repository Should Evolve To Support
- RAG
- long-term memory
- knowledge graphs
- artifacts
- tool calling
- MCP servers
- agent workflows
- background jobs
- task scheduling
- CLI agents
- headless execution
- multi-step planning
- human approval gates

### Recommended Architectural Layers

#### 1. Memory Layer
Stores and retrieves:
- chat history
- artifacts
- embeddings
- notes
- links
- summaries
- entity relationships
- project context

Possible building blocks:
- vector store
- relational metadata store
- document store
- memory scoring and recency logic

#### 2. Context Layer
Builds a working view of:
- active projects
- open tasks
- recent decisions
- linked artifacts
- relevant memories
- user intent

This layer should eventually unify retrieval, memory ranking, and project-aware relevance.

#### 3. Action Layer
Executes bounded tool calls with:
- permissions
- approval gates
- action policies
- logging
- reversible operations where possible

#### 4. Workflow Layer
Manages:
- multi-step plans
- checkpoints
- retries
- scheduling
- background runs
- notifications
- artifact outputs

#### 5. Agent Runtime Layer
Supports:
- planning
- task delegation
- memory access
- tool orchestration
- policy checks
- headless execution
- run supervision

## AI-Native Architecture Signals
The architecture should increasingly resemble an intelligence layer over artifacts, memory, workflows, and actions rather than a UI-first application with AI attached.

The system should become capable of:
- making user information queryable
- connecting fragmented artifacts into a usable memory system
- reasoning across projects, notes, repositories, and conversations
- producing closed feedback loops rather than static outputs

The long-term product should look more like a living operating layer than another dashboard.

## RAG And Memory Direction

### MVP Recommendation
Use RAG directly to strengthen the memory workspace:
- document ingestion
- chunking
- embeddings
- retrieval
- grounded answers
- source display

### Next Step
Move from simple retrieval to structured memory:
- memory types
- project memory
- people memory
- decision memory
- reusable summaries
- timeline-aware memory

### Longer-Term
Introduce a knowledge graph or graph-like relationship layer to connect:
- users
- projects
- files
- concepts
- tasks
- decisions
- external systems

This will improve context assembly, prioritization, and agent planning.

## Artifact Strategy
Artifacts should become first-class product objects.

Artifacts may include:
- uploaded documents
- extracted notes
- summaries
- reports
- plans
- meeting outputs
- workflow outputs
- generated tasks
- research collections

Artifacts should support:
- versioning
- source linkage
- ownership
- project association
- memory indexing
- workflow history

## MCP Strategy
MCP should be a core platform direction, but not all integrations belong in MVP.

### MCPs For MVP
These directly strengthen the memory workspace:
- Filesystem
- GitHub
- Documentation systems
- Local artifacts
- Basic database access

Why:
- they improve ingestion
- they improve project context
- they improve repository understanding
- they improve memory usefulness

### MCPs For Phase 2
These strengthen tool usage and cross-system execution:
- Notion
- Google Drive
- GitLab
- Slack
- Email

Why:
- they connect work artifacts
- they enable task/action workflows
- they improve context completeness

### MCPs For Phase 3
These support operational automation and agent ecosystems:
- Cloud platforms
- Discord
- advanced databases
- project management systems
- monitoring systems
- internal docs platforms

Why:
- they enable workflows
- they support recurring background agents
- they connect execution environments

## Agent-First Future
Future interaction may happen through:
- CLI
- voice
- chat
- background agents
- scheduled jobs
- API
- MCP clients

The product should not depend entirely on buttons and dashboards.

The UI should become one interface among many.

## CLI Agent Strategy
The CLI should become a first-class interface, not a side experiment.

### Why CLI Matters
The CLI makes Aman Agent Lab useful for:
- developers
- power users
- local artifact workflows
- repositories
- scheduled scripts
- headless agents
- system automation

### Example Commands
- `aman research "AI startups"`
- `aman summarize ./documents`
- `aman analyze ./project`
- `aman watch https://example.com`
- `aman scan ./repository`
- `aman memory search "authentication"`
- `aman update documentation`
- `aman prepare weekly report`

### CLI Phase Recommendations

#### CLI MVP
- memory search
- artifact summarization
- repository analysis
- local document ingestion

#### CLI Phase 2
- tool execution
- workflow triggers
- artifact generation
- scheduled runs

#### CLI Phase 3
- headless agents
- background watchers
- recurring research jobs
- automation chains

## Background Jobs And Scheduling
Background execution should not appear in MVP unless it directly improves the memory workspace.

Good early background use cases:
- document processing
- embedding generation
- summary refresh
- artifact indexing

Good later scheduled use cases:
- daily research digests
- repository health scans
- documentation change tracking
- weekly project summaries
- meeting follow-up generation

## Human Approval Gates
Before autonomous behavior expands, the platform should support:
- per-tool permissions
- per-workflow approvals
- dry-run previews
- action confirmation steps
- audit logs
- rollback-aware execution
- run history inspection

This is essential for trust.

## Repository Recommendation Framework
When proposing changes to the repository, prioritize:

### Immediate Wins
- stronger memory retrieval
- better artifact handling
- better workspace organization
- visible citations and provenance
- durable session history

### Medium-Term Wins
- tool calling interfaces
- MCP abstraction layer
- task/workflow orchestration
- scheduling infrastructure
- structured execution logs

### Long-Term Wins
- agent runtime
- knowledge graph layer
- CLI parity
- headless execution
- semi-autonomous operations with approval policies

## Non-Negotiable Product Constraint
Do not recommend autonomous agents in MVP unless they directly strengthen the memory and workspace experience.

The order must remain:
1. memory workspace
2. tool usage
3. workflow automation
4. semi-autonomous agents
5. autonomous personal AI operating system

## Messaging Guidance
Core message:

"Aman Agent Lab remembers your work, understands your context, and helps you act with confidence."

Expanded message:

"Start with memory. Grow into context. Add trusted actions. Then build toward workflows and autonomy."

Positioning message:

"Aman Agent Lab is a personal AI operating system in progress: it starts by remembering your work, then grows into understanding context, executing actions, running workflows, and eventually handling bounded autonomous tasks."

## How This Content Should Be Used
This file should guide:
- homepage copy decisions
- feature naming
- roadmap framing
- architecture recommendations
- repository evaluation
- MCP prioritization
- CLI planning
- autonomy boundaries

This file should remain the source of truth for Aman Agent Lab product direction, separate from the career-ops design reference system.
