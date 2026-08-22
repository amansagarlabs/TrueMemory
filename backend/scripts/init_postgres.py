"""Run the MVP Postgres schema manually against DATABASE_URL."""

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

    schema_path = project_root / "backend" / "db" / "init" / "001_mvp_schema.sql"
    sql = schema_path.read_text(encoding="utf-8")

    with psycopg.connect(database_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)

    print(f"Postgres schema applied from {schema_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
