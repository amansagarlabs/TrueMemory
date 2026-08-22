"""
Test CrewAI on amansagar.in — run directly, no auth needed.
Usage: cd backend && python test_crew.py
"""

import asyncio
import sys
import os

sys.path.insert(0, ".")
os.chdir(os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv("../.env")

from agents.crawl_agents import WebIntelligenceCrew, synthesize_answer


async def test_scrape():
    print("\n" + "=" * 60)
    print("TEST 1: Scrape amansagar.in with instruction")
    print("=" * 60)
    crew = WebIntelligenceCrew()
    result = await crew.scrape(
        "https://amansagar.in",
        instruction="Extract the person's name, profession, list of projects with titles, and list of blog posts with titles"
    )
    if "answer" in result:
        print(f"\nAI ANSWER:\n{result['answer']}")
    else:
        print(f"\nRAW RESULT:\n{result}")


async def test_crawl():
    print("\n" + "=" * 60)
    print("TEST 2: Crawl amansagar.in (3 pages) with instruction")
    print("=" * 60)
    crew = WebIntelligenceCrew()
    result = await crew.crawl(
        "https://amansagar.in",
        max_pages=3,
        instruction="Count how many blog posts and projects are listed, list their titles"
    )
    if "answer" in result:
        print(f"\nAI ANSWER:\n{result['answer']}")
    else:
        print(f"\nRAW RESULT:\n{result}")


async def test_synthesis_only():
    print("\n" + "=" * 60)
    print("TEST 3: Synthesis only (fake data + instruction)")
    print("=" * 60)
    fake_data = {
        "pages": [
            {"url": "https://amansagar.in", "title": "Aman Sagar - Full Stack Developer"},
            {"url": "https://amansagar.in/blog/ai-agents", "title": "Building AI Agents"},
            {"url": "https://amansagar.in/blog/git-commands", "title": "Essential Git Commands"},
            {"url": "https://amansagar.in/blog/future-of-coding", "title": "The Future of Coding"},
        ]
    }
    answer = await synthesize_answer(fake_data, "How many blog posts are there? List their titles.")
    print(f"\nAI ANSWER:\n{answer}")


async def main():
    print("CrewAI Test — amansagar.in")
    print(f"OpenRouter Key: {'SET' if os.getenv('OPENROUTER_API_KEY') else 'MISSING'}")
    print(f"Model: {os.getenv('OPENROUTER_MODEL', 'openrouter/free')}")

    try:
        await test_synthesis_only()
        await test_scrape()
        await test_crawl()
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
