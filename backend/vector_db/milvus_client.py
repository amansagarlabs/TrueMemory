"""
Zilliz Cloud / Milvus connection — Step 7 implements collection + insert/search.

LEARNING: Vector DBs store embedding vectors + metadata (chunk text, page, doc id).
          Zilliz Cloud is managed Milvus — same API, no local Docker.

Token format: MILVUS_TOKEN = "db_username:db_password" from Zilliz dashboard.
"""

from pymilvus import MilvusClient

from app.config import Settings


def get_milvus_client(settings: Settings) -> MilvusClient:
    if not settings.milvus_address or not settings.milvus_token:
        raise ValueError(
            "Missing MILVUS_ADDRESS or MILVUS_TOKEN in .env (project root: my-ai-app/.env)"
        )
    return MilvusClient(
        uri=settings.milvus_address,
        token=settings.milvus_token,
    )
