from query.market import build_verified_market_price_answer


def test_market_price_answer_uses_numeric_AmanCrawl_evidence():
    answer = build_verified_market_price_answer(
        "current market price of tata steel",
        [
            {
                "title": "Tata Steel Share Price Today - Live NSE/BSE | ICICI Direct",
                "url": "https://www.icicidirect.com/stocks/tata-steel-ltd-share-price",
                "domain": "icicidirect.com",
                "snippet": "Tata Steel share price as on 22 Jul 2026 is Rs. 185.59.",
            }
        ],
        "Asia/Kolkata",
    )

    assert answer is not None
    assert "Tata Steel is ₹185.59 per share" in answer
    assert "[icicidirect.com](https://www.icicidirect.com/stocks/tata-steel-ltd-share-price)" in answer
    assert "visiting one of" not in answer.lower()


def test_market_price_answer_fails_closed_without_numeric_evidence():
    answer = build_verified_market_price_answer(
        "Tata Steel share price",
        [],
        "Asia/Kolkata",
    )

    assert answer is not None
    assert "couldn't verify a current numeric price" in answer
    assert "list of finance websites" in answer
