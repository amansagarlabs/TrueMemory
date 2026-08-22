import httpx, json

headers = {
    "Content-Type": "application/json",
    "x-auth-context": json.dumps({
        "authenticated": True,
        "user": {"id": "d6d6331a-7572-4d71-9341-e40fb36fb4f9"},
        "session_token": "test-token",
        "scopes": ["crawl:extract", "crawl:scrape", "crawl:search", "crawl:map", "crawl:crawl"]
    })
}

body = {
    "url": "https://example.com",
    "instruction": "Extract the title and main text as JSON"
}

r = httpx.post("http://localhost:8000/api/AmanCrawl/agent/extract", headers=headers, json=body, timeout=60)
print(f"Status: {r.status_code}")
print(r.text[:2000])
