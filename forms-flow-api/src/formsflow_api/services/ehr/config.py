import os
from pathlib import Path

from dotenv import load_dotenv


# Load .env from this folder if present
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    load_dotenv(env_path)


def _bool_env(name: str, default: str = "false") -> bool:
    return str(os.getenv(name, default)).lower() == "true"


# immudb settings (defaults kept to match previous behavior)
IMMUDB_ENABLED = _bool_env("IMMUDB_ENABLED", "true")
IMMUDB_HOST = os.getenv("IMMUDB_HOST", "localhost:3322")
IMMUDB_USER = os.getenv("IMMUDB_USER", "immudb")
IMMUDB_PASS = os.getenv("IMMUDB_PASS", "immudb")
