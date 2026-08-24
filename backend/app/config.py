"""
Central configuration — loaded from environment variables.

LEARNING: Production AI services never hardcode API keys or DB URLs.
          `pydantic-settings` / env vars let you swap dev vs prod safely.
"""

import os
from dataclasses import dataclass, field
from functools import lru_cache

from services.model_registry import OPENROUTER_FREE_MODEL, OPENROUTER_FREE_VISION_MODEL


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _build_postgres_url(
    *,
    host: str,
    port: str,
    database: str,
    user: str,
    password: str,
) -> str:
    if not all([host, port, database, user]):
        return ""
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


@dataclass
class Settings:
    environment: str = "development"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: list[str] = field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    # Zilliz Cloud (Milvus)
    milvus_address: str = ""
    milvus_token: str = ""
    milvus_collection: str = "pdf_chunks"

    # OpenRouter — Step 9
    openrouter_api_key: str = ""
    openrouter_model: str = OPENROUTER_FREE_MODEL
    openrouter_vision_model: str = OPENROUTER_FREE_VISION_MODEL
    openrouter_max_tokens: int = 2048
    ollama_base_url: str = "http://host.docker.internal:11434"
    ollama_model: str = "qwen3-coder:30b"
    ollama_fallback_enabled: bool = True

    # Embeddings — Step 6
    embedding_model: str = "all-MiniLM-L6-v2"
    embedding_dimension: int = 384

    # Chunking — Step 4
    chunk_size: int = 500
    chunk_overlap: int = 50
    top_k_chunks: int = 5

    # Curated knowledge-base retrieval
    curated_kb_path: str = "knowledge_base/curated.jsonl"
    hybrid_dense_weight: float = 0.55
    hybrid_bm25_weight: float = 0.45
    hybrid_candidate_k: int = 24
    hybrid_top_k: int = 6
    cross_encoder_model: str = ""
    warm_retrieval_models: bool = False

    uploads_dir: str = "uploads"
    ocr_provider: str = "auto"
    ocr_language: str = "eng"
    tesseract_cmd: str = ""
    paddleocr_device: str = "cpu"
    paddleocr_pipeline_version: str = "v1.6"
    pipeline_max_chunks: int = 120  # cap for free tier / CPU; 0 = unlimited
    memory_db_path: str = "backend/data/memory.db"
    memory_recent_turns: int = 8
    memory_profile_items: int = 6
    memory_hot_ttl_seconds: float = 30.0
    memory_hot_max_entries: int = 512
    memory_l2_candidate_limit: int = 200
    memory_l2_rrf_k: int = 60
    memory_l2_semantic_enabled: bool = True
    memory_l2_embedding_retry_seconds: float = 30.0
    memory_rate_limit: int = 120
    memory_rate_window_seconds: float = 60.0
    use_docker_postgres: bool = False
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "app-agent"
    postgres_user: str = "postgres"
    database_url: str = ""
    database_mode: str = "local"
    web_search_enabled: bool = False
    tavily_api_key: str = ""
    github_token: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    github_oauth_redirect_uri: str = "http://localhost:8000/api/integrations/github/callback"
    github_oauth_frontend_url: str = "http://localhost:3000/connectors"
    github_oauth_scope: str = "read:user user:email"
    coding_runtime_enabled: bool = False
    coding_runtime_image: str = "truememory-coding-runtime:local"
    coding_runtime_root: str = "data/coding_workspaces"
    coding_runtime_volume: str = ""
    coding_runtime_memory: str = "1024m"
    coding_runtime_cpus: float = 1.0
    coding_runtime_pids: int = 256
    web_search_max_results: int = 5
    searxng_url: str = "http://searxng:8080"
    search_free_only: bool = True
    search_allow_remote_fallback: bool = False
    image_search_enabled: bool = True
    image_search_max_results: int = 5
    image_search_timeout: float = 8.0
    image_search_relevance_threshold: float = 0.75
    openverse_enabled: bool = True
    wikimedia_enabled: bool = True

    # Auth — shared across both platforms
    aman_jwt_secret: str = ""
    aman_session_duration_days: int = 7
    aman_api_key_header: str = "X-Aman-API-Key"
    aman_auth_service_url: str = ""
    auth_cookie_secure: bool = False
    admin_user_ids: list[str] = field(default_factory=list)
    admin_emails: list[str] = field(default_factory=list)


@lru_cache
def get_settings() -> Settings:
    cors = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    admin_user_ids = [item.strip() for item in os.getenv("ADMIN_USER_IDS", "").split(",") if item.strip()]
    admin_emails = [item.strip().casefold() for item in os.getenv("ADMIN_EMAILS", "").split(",") if item.strip()]
    use_docker_postgres = _env_bool("USE_DOCKER_POSTGRES", False)
    postgres_port = os.getenv("POSTGRES_PORT", "5432")
    postgres_db = os.getenv("POSTGRES_DB", "app-agent")
    postgres_user = os.getenv("POSTGRES_USER", "postgres")
    postgres_password = os.getenv("POSTGRES_PASSWORD", "")
    postgres_local_host = os.getenv("POSTGRES_LOCAL_HOST", "localhost")
    postgres_docker_host = os.getenv("POSTGRES_DOCKER_HOST", "postgres")
    database_url_local = os.getenv("DATABASE_URL_LOCAL", "").strip()
    database_url_docker = os.getenv("DATABASE_URL_DOCKER", "").strip()
    legacy_database_url = os.getenv("DATABASE_URL", "").strip()

    if use_docker_postgres:
        resolved_database_url = (
            database_url_docker
            or _build_postgres_url(
                host=postgres_docker_host,
                port=postgres_port,
                database=postgres_db,
                user=postgres_user,
                password=postgres_password,
            )
            or legacy_database_url
        )
        resolved_postgres_host = postgres_docker_host
        database_mode = "docker"
    else:
        resolved_database_url = (
            database_url_local
            or _build_postgres_url(
                host=postgres_local_host,
                port=postgres_port,
                database=postgres_db,
                user=postgres_user,
                password=postgres_password,
            )
            or legacy_database_url
        )
        resolved_postgres_host = postgres_local_host
        database_mode = "local"

    return Settings(
        environment=os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "development")).strip().lower(),
        backend_host=os.getenv("BACKEND_HOST", "0.0.0.0"),
        backend_port=int(os.getenv("BACKEND_PORT", "8000")),
        cors_origins=[o.strip() for o in cors.split(",")],
        milvus_address=os.getenv("MILVUS_ADDRESS", ""),
        milvus_token=os.getenv("MILVUS_TOKEN", ""),
        milvus_collection=os.getenv("MILVUS_COLLECTION_NAME", "pdf_chunks"),
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY", ""),
        openrouter_model=os.getenv("OPENROUTER_MODEL", OPENROUTER_FREE_MODEL),
        openrouter_vision_model=os.getenv("OPENROUTER_VISION_MODEL", OPENROUTER_FREE_VISION_MODEL),
        openrouter_max_tokens=max(256, min(int(os.getenv("OPENROUTER_MAX_TOKENS", "2048")), 8192)),
        ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/"),
        ollama_model=os.getenv("OLLAMA_MODEL", "qwen3-coder:30b"),
        ollama_fallback_enabled=_env_bool("OLLAMA_FALLBACK_ENABLED", True),
        embedding_model=os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2"),
        embedding_dimension=int(os.getenv("EMBEDDING_DIMENSION", "384")),
        chunk_size=int(os.getenv("CHUNK_SIZE", "500")),
        chunk_overlap=int(os.getenv("CHUNK_OVERLAP", "50")),
        top_k_chunks=int(os.getenv("TOP_K_CHUNKS", "5")),
        curated_kb_path=os.getenv("CURATED_KB_PATH", "knowledge_base/curated.jsonl"),
        hybrid_dense_weight=float(os.getenv("HYBRID_DENSE_WEIGHT", "0.55")),
        hybrid_bm25_weight=float(os.getenv("HYBRID_BM25_WEIGHT", "0.45")),
        hybrid_candidate_k=int(os.getenv("HYBRID_CANDIDATE_K", "24")),
        hybrid_top_k=int(os.getenv("HYBRID_TOP_K", "6")),
        cross_encoder_model=os.getenv("CROSS_ENCODER_MODEL", ""),
        warm_retrieval_models=_env_bool("WARM_RETRIEVAL_MODELS", False),
        uploads_dir=os.getenv("UPLOADS_DIR", "uploads"),
        ocr_provider=os.getenv("OCR_PROVIDER", "auto"),
        ocr_language=os.getenv("OCR_LANGUAGE", "eng"),
        tesseract_cmd=os.getenv("TESSERACT_CMD", ""),
        paddleocr_device=os.getenv("PADDLEOCR_DEVICE", "cpu"),
        paddleocr_pipeline_version=os.getenv("PADDLEOCR_PIPELINE_VERSION", "v1.6"),
        pipeline_max_chunks=int(os.getenv("PIPELINE_MAX_CHUNKS", "120")),
        memory_db_path=os.getenv("MEMORY_DB_PATH", "backend/data/memory.db"),
        memory_recent_turns=int(os.getenv("MEMORY_RECENT_TURNS", "8")),
        memory_profile_items=int(os.getenv("MEMORY_PROFILE_ITEMS", "6")),
        memory_hot_ttl_seconds=float(os.getenv("MEMORY_HOT_TTL_SECONDS", "30")),
        memory_hot_max_entries=int(os.getenv("MEMORY_HOT_MAX_ENTRIES", "512")),
        memory_l2_candidate_limit=int(os.getenv("MEMORY_L2_CANDIDATE_LIMIT", "200")),
        memory_l2_rrf_k=int(os.getenv("MEMORY_L2_RRF_K", "60")),
        memory_l2_semantic_enabled=_env_bool("MEMORY_L2_SEMANTIC_ENABLED", True),
        memory_l2_embedding_retry_seconds=float(os.getenv("MEMORY_L2_EMBEDDING_RETRY_SECONDS", "30")),
        memory_rate_limit=int(os.getenv("MEMORY_RATE_LIMIT", "120")),
        memory_rate_window_seconds=float(os.getenv("MEMORY_RATE_WINDOW_SECONDS", "60")),
        use_docker_postgres=use_docker_postgres,
        postgres_host=resolved_postgres_host,
        postgres_port=int(postgres_port),
        postgres_db=postgres_db,
        postgres_user=postgres_user,
        database_url=resolved_database_url,
        database_mode=database_mode,
        web_search_enabled=_env_bool("WEB_SEARCH_ENABLED", False),
        tavily_api_key=os.getenv("TAVILY_API_KEY", ""),
        github_token=os.getenv("GITHUB_TOKEN", ""),
        github_client_id=os.getenv("GITHUB_CLIENT_ID", ""),
        github_client_secret=os.getenv("GITHUB_CLIENT_SECRET", ""),
        github_oauth_redirect_uri=os.getenv(
            "GITHUB_OAUTH_REDIRECT_URI",
            "http://localhost:8000/api/integrations/github/callback",
        ),
        github_oauth_frontend_url=os.getenv(
            "GITHUB_OAUTH_FRONTEND_URL",
            "http://localhost:3000/connectors",
        ),
        github_oauth_scope=os.getenv(
            "GITHUB_OAUTH_SCOPE",
            "read:user user:email",
        ),
        coding_runtime_enabled=_env_bool("CODING_RUNTIME_ENABLED", False),
        coding_runtime_image=os.getenv(
            "CODING_RUNTIME_IMAGE",
            "truememory-coding-runtime:local",
        ),
        coding_runtime_root=os.getenv(
            "CODING_RUNTIME_ROOT",
            "data/coding_workspaces",
        ),
        coding_runtime_volume=os.getenv("CODING_RUNTIME_VOLUME", "").strip(),
        coding_runtime_memory=os.getenv("CODING_RUNTIME_MEMORY", "1024m"),
        coding_runtime_cpus=max(
            0.25,
            min(float(os.getenv("CODING_RUNTIME_CPUS", "1.0")), 8.0),
        ),
        coding_runtime_pids=max(
            32,
            min(int(os.getenv("CODING_RUNTIME_PIDS", "256")), 2048),
        ),
        web_search_max_results=int(os.getenv("WEB_SEARCH_MAX_RESULTS", "5")),
        searxng_url=os.getenv("SEARXNG_URL", "http://searxng:8080"),
        search_free_only=_env_bool("SEARCH_FREE_ONLY", True),
        search_allow_remote_fallback=_env_bool("SEARCH_ALLOW_REMOTE_FALLBACK", False),
        image_search_enabled=_env_bool("IMAGE_SEARCH_ENABLED", True),
        image_search_max_results=int(os.getenv("IMAGE_SEARCH_MAX_RESULTS", "5")),
        image_search_timeout=float(os.getenv("IMAGE_SEARCH_TIMEOUT", "8")),
        image_search_relevance_threshold=float(os.getenv("IMAGE_SEARCH_RELEVANCE_THRESHOLD", "0.75")),
        openverse_enabled=_env_bool("OPENVERSE_ENABLED", True),
        wikimedia_enabled=_env_bool("WIKIMEDIA_ENABLED", True),
        aman_jwt_secret=os.getenv("AMAN_JWT_SECRET", ""),
        aman_session_duration_days=int(os.getenv("AMAN_SESSION_DURATION_DAYS", "7")),
        aman_api_key_header=os.getenv("AMAN_API_KEY_HEADER", "X-Aman-API-Key"),
        aman_auth_service_url=os.getenv("AMAN_AUTH_SERVICE_URL", ""),
        auth_cookie_secure=_env_bool("AUTH_COOKIE_SECURE", False),
        admin_user_ids=admin_user_ids,
        admin_emails=admin_emails,
    )
