# Package Selection

| Capability | Default choice | Why | Optional alternative |
| --- | --- | --- | --- |
| Web search | SearXNG | Self-hosted metasearch, JSON API, no paid key | DuckDuckGo HTML |
| JS crawling | Crawl4AI | Open-source async crawler with browser rendering and extraction | Existing HTTP crawler |
| Article extraction | Trafilatura | Main-text + metadata extraction, Apache 2.0 | BeautifulSoup/readability |
| Open images | Openverse | Free API, openly licensed/public-domain catalog | Wikimedia Commons |
| Wikimedia images | MediaWiki Commons API | First-party structured media metadata | Openverse only |
| Scholarly search | OpenAlex | Open catalog and free API key | Crossref/Europe PMC adapters |
| Metadata | OpenGraph/Twitter HTML tags | Works on ordinary websites, no provider account | Trafilatura metadata |
| LLM answer | OpenRouter `openrouter/free` or local Ollama | No paid model is required | Any OpenAI-compatible local server |
| Stream transport | Existing SSE contract | Already integrated with chat persistence/UI | WebSocket later if bidirectional control is needed |
| UI citations | Existing inline citation component | Keyboard-accessible hover card and source drawer | Open WebUI citation patterns |

The default path deliberately avoids Tavily, Brave, SerpAPI, Exa, Firecrawl
Cloud, Jina Cloud, and Unsplash API credentials. Optional adapters can be added
without changing the normalized source contract.
