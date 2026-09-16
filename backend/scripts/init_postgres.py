"""Apply all PostgreSQL schema migrations against DATABASE_URL."""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
import psycopg


def main() -> int:
    project_root = Path(__file__).resolve().parents[2]
    load_dotenv(project_root / ".env")

    import os

    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        print("DATABASE_URL is missing in .env")
        return 1

    schema_dir = project_root / "backend" / "db" / "init"
    schema_paths = sorted(schema_dir.glob("*.sql"))
    if not schema_paths:
        print(f"No SQL migrations found in {schema_dir}")
        return 1

    with psycopg.connect(database_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            for schema_path in schema_paths:
                print(f"Applying {schema_path.name}...")
                cur.execute(schema_path.read_text(encoding="utf-8"))

    print(f"Postgres schema applied from {len(schema_paths)} migration files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
