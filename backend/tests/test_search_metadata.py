import asyncio

from search.metadata import parse_metadata


def test_parse_metadata_prefers_open_graph_and_resolves_urls():
    metadata = parse_metadata(
        """
        <html><head>
          <title>Fallback title</title>
          <meta property="og:title" content="Open Graph title">
          <meta property="og:description" content="A concise summary">
          <meta property="og:image" content="/images/hero.jpg">
          <link rel="icon" href="/favicon.svg">
        </head></html>
        """,
        "https://example.org/article",
    )
    assert metadata.title == "Open Graph title"
    assert metadata.description == "A concise summary"
    assert metadata.image_url == "https://example.org/images/hero.jpg"
    assert metadata.favicon_url == "https://example.org/favicon.svg"


def test_parse_metadata_is_safe_for_missing_tags():
    metadata = parse_metadata("<html><body>hello</body></html>", "https://example.org")
    assert metadata.title == ""
    assert metadata.image_url == ""

