import asyncio
import threading
import unittest
from unittest.mock import patch

from truememory_memory import AuthenticationError, ServerError, TrueMemory


class ClientTests(unittest.TestCase):
    def test_safe_requests_retry_server_errors(self):
        client = TrueMemory("token", max_retries=1)
        with patch.object(client, "_sync", side_effect=[ServerError("temporary"), {"status": "ok"}]) as sync:
            self.assertEqual(asyncio.run(client.health()), {"status": "ok"})
            self.assertEqual(sync.call_count, 2)

    def test_write_requests_are_not_retried(self):
        client = TrueMemory("token", max_retries=2)
        with patch.object(client, "_sync", side_effect=ServerError("failed")) as sync:
            with self.assertRaises(ServerError):
                asyncio.run(client.remember("k", "v"))
            self.assertEqual(sync.call_count, 1)

    def test_cancellation_is_deterministic(self):
        client = TrueMemory("token")
        signal = threading.Event()
        signal.set()
        with self.assertRaisesRegex(Exception, "cancelled"):
            asyncio.run(client.health(signal=signal))


if __name__ == "__main__":
    unittest.main()
