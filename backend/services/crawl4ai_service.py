"""
Crawl4AI integration — primary crawler for AmanCrawl.

Falls back to Playwright browser when Crawl4AI fails.
Falls back to Jina Reader when Playwright fails.
Falls back to httpx when all else fails.
"""

import os
import logging
import httpx

logger = logging.getLogger(__name__)


async def crawl4ai_scrape(
    url: str,
    timeout: float = 30.0,
    extract_mode: str = "markdown",
) -> dict | None:
    """
    Scrape a URL using Crawl4AI with automatic fallback chain.

    Fallback: Crawl4AI → Playwright → Jina Reader → httpx

    Returns dict with keys: url, title, markdown, content_length, provider, error
    """
    # 1. Try Crawl4AI
    result = await _crawl4ai_fetch(url, timeout, extract_mode)
    if result and not result.get("error"):
        return result

    # 2. Try Playwright browser
    result = await _playwright_fetch(url, timeout)
    if result and not result.get("error"):
        return result

    # 3. Try Jina Reader
    result = await _jina_fetch(url, timeout)
    if result and not result.get("error"):
        return result

    # 4. Try httpx (last resort)
    result = await _httpx_fetch(url, timeout)
    return result


async def _crawl4ai_fetch(url: str, timeout: float, extract_mode: str) -> dict | None:
    """Scrape using Crawl4AI library."""
    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

        browser_config = BrowserConfig(
            headless=True,
            browser_type="chromium",
        )
        run_config = CrawlerRunConfig(
            word_count_threshold=10,
            cache_mode=CacheMode.BYPASS,
        )

        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=url, config=run_config)

            if result.success:
                markdown = result.markdown or ""
                return {
                    "url": url,
                    "title": result.metadata.get("title", "") if result.metadata else "",
                    "markdown": markdown,
                    "content_length": len(markdown),
                    "provider": "crawl4ai",
                    "error": None,
                }
            else:
                logger.warning(f"Crawl4AI failed for {url}: {result.error_message}")
                return None

    except ImportError:
        logger.info("Crawl4AI not installed, skipping")
        return None
    except Exception as e:
        logger.warning(f"Crawl4AI error for {url}: {e}")
        return None


async def _playwright_fetch(url: str, timeout: float) -> dict | None:
    """Scrape using Playwright browser (handles JS-rendered pages)."""
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()

            # Set realistic viewport and user agent
            await page.set_viewport_size({"width": 1920, "height": 1080})

            response = await page.goto(url, wait_until="domcontentloaded", timeout=int(timeout * 1000))
            if not response or response.status >= 400:
                await browser.close()
                return None

            # Wait for content
            await page.wait_for_load_state("networkidle", timeout=int(timeout * 1000))

            title = await page.title()
            content = await page.content()

            await browser.close()

            # Convert to markdown using beautifulsoup
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(content, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()

            text = soup.get_text(separator="\n", strip=True)
            if len(text) < 50:
                return None

            return {
                "url": url,
                "title": title,
                "markdown": text,
                "content_length": len(text),
                "provider": "playwright",
                "error": None,
            }

    except ImportError:
        logger.info("Playwright not installed, skipping")
        return None
    except Exception as e:
        logger.warning(f"Playwright error for {url}: {e}")
        return None


async def _jina_fetch(url: str, timeout: float) -> dict | None:
    """Scrape using Jina Reader API."""
    try:
        jina_key = os.getenv("JINA_API_KEY", "")
        headers = {
            "Accept": "application/json",
            "X-Retain-Images": "none",
            "X-Return-Format": "markdown",
        }
        if jina_key:
            headers["Authorization"] = f"Bearer {jina_key}"

        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(f"https://r.jina.ai/{url}", headers=headers)
            resp.raise_for_status()
            data = resp.json()

        content = data.get("data", {})
        title = content.get("title", "")
        markdown = content.get("content", "") or content.get("markdown", "")

        if not markdown:
            return None

        return {
            "url": url,
            "title": title,
            "markdown": markdown,
            "content_length": len(markdown),
            "provider": "jina",
            "error": None,
        }

    except Exception as e:
        logger.warning(f"Jina fetch error for {url}: {e}")
        return None


async def _httpx_fetch(url: str, timeout: float) -> dict | None:
    """Scrape using plain httpx (last resort)."""
    try:
        user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        ]
        headers = {
            "User-Agent": user_agents[0],
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }

        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
            resp = await client.get(url)
            if resp.status_code >= 400:
                return None

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style"]):
            tag.decompose()

        title = soup.title.string.strip() if soup.title and soup.title.string else ""
        text = soup.get_text(separator="\n", strip=True)

        if len(text) < 50:
            return None

        return {
            "url": url,
            "title": title,
            "markdown": text,
            "content_length": len(text),
            "provider": "httpx",
            "error": None,
        }

    except Exception as e:
        logger.warning(f"httpx fetch error for {url}: {e}")
        return {"url": url, "error": str(e), "provider": "httpx"}
