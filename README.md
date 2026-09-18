# TrueMemory

![TrueMemory — persistent context for intelligent agents](media/truememory-banner.png)

TrueMemory gives AI agents durable memory they can use across conversations, projects, tools, and sessions.

Agents forget. Context gets scattered across chat logs, documents, and project tools. TrueMemory keeps the useful parts close at hand: searchable, persistent, and ready when the next task begins.

## What TrueMemory does

- Stores durable memories, decisions, preferences, and project context
- Retrieves relevant context across sessions
- Connects documents, conversations, coding work, and external tools
- Handles authentication, workspaces, projects, and agent workflows
- Uses PostgreSQL for durable application data and Milvus for vector search

## Built for agents that keep working

TrueMemory is designed for products where continuity matters: research assistants, coding agents, document workflows, support tools, and internal knowledge systems.

The stack is straightforward:

- Next.js for the product interface
- FastAPI for the API and agent services
- Supabase PostgreSQL for production persistence
- Zilliz Cloud / Milvus for semantic retrieval

## Quick links

- [Product docs](docs/README.md)
- [Architecture](docs/architecture/TRUEMEMORY_DOCS_ARCHITECTURE.md)
- [API and agent guides](docs/)
- [Developer setup](DEVELOPMENT.md)
- [License](LICENSE)

## Run it locally

```powershell
git clone https://github.com/amansagarlabs/TrueMemory.git
cd TrueMemory
npm install
```

For environment variables, database migrations, Docker, testing, and deployment, see the [developer setup guide](DEVELOPMENT.md).

## Status

TrueMemory is an active product codebase. The public interface, API, memory services, authentication, workspace model, and agent tooling live in this repository.

## Contributing

Issues, focused pull requests, and practical feedback are welcome. Start with [DEVELOPMENT.md](DEVELOPMENT.md), then open an issue if a larger change needs discussion.

## License

See [LICENSE](LICENSE).
