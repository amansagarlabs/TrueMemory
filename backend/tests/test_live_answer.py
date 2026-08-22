from query.live_answer import live_answer_needs_repair, unavailable_live_answer


def test_live_directory_response_is_rejected():
    answer = "You can find the latest score by visiting one of the following reliable sources: ESPN, BBC, or Flashscore."
    assert live_answer_needs_repair(answer) is True


def test_direct_live_update_is_accepted():
    answer = "No Premier League matches are live right now; the next fixture starts at 19:30 BST."
    assert live_answer_needs_repair(answer) is False


def test_live_failure_does_not_redirect_to_websites():
    answer = unavailable_live_answer("Current weather")
    assert "couldn't verify" in answer
    assert "list of websites" in answer
