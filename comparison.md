# OSS/Free Option Comparison

| Project | Best use | Self-hostable | Cost model | Decision |
| --- | --- | ---: | --- | --- |
| SearXNG | General web discovery | Yes | Free software; upstream engines vary | Default |
| DuckDuckGo HTML | Emergency search fallback | N/A | No API key; rate limits/blocks possible | Fallback |
| Crawl4AI | JS pages, bounded crawl, extraction | Yes | Free software; local compute | Optional worker |
| Trafilatura | Article/main-text extraction | Yes | Apache 2.0 library | Preferred extractor |
| Openverse | Open image discovery | API/service available; stack open source | Free, rate limited, attribution required | Default image source |
| Wikimedia Commons | Historical/scientific/open media | API available | Free, attribution/licensing required | Image fallback |
| OpenAlex | Scholarly works and citations | API/data access | Free API key | Specialized search |
| YaCy | Distributed/full crawler search | Yes | Local compute/storage | Future indexer |
| Apache Nutch | Large scheduled crawling/indexing | Yes | Local compute/storage | Future batch indexer |
| Firecrawl | Modern extraction | OSS core, hosted service separate | Hosted usage may cost | Not default |
| Browser Use | Browser automation | OSS library, model/browser cost remains | Local model required | Agent-only future |
| Unsplash | High-quality photos | API available | Terms/rate limits; not a fully self-hosted catalog | Avoid as default |

The comparison separates an open-source project from a free hosted endpoint:
free access can still have quotas, rate limits, terms, or availability changes.
