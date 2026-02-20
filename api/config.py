"""Application configuration from environment variables."""

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    database_url: str = os.environ.get(
        "DATABASE_URL",
        "postgresql://{user}:{pw}@{host}:{port}/{db}".format(
            user=os.environ.get("DB_USER", "ingesthub"),
            pw=os.environ.get("DB_PASSWORD", "ingesthub_dev_2024"),
            host=os.environ.get("DB_HOST", "localhost"),
            port=os.environ.get("DB_PORT", "5432"),
            db=os.environ.get("DB_NAME", "ingesthub"),
        ),
    )

    media_root_paths: list = field(
        default_factory=lambda: [p.strip() for p in os.environ.get("MEDIA_ROOT_PATHS", "").split(",") if p.strip()]
    )

    cors_origins: list = field(
        default_factory=lambda: [
            o.strip()
            for o in os.environ.get(
                "CORS_ORIGINS",
                "http://localhost:5173,http://localhost:3000,http://localhost:8080",
            ).split(",")
        ]
    )

    db_pool_min: int = int(os.environ.get("DB_POOL_MIN", "2"))
    db_pool_max: int = int(os.environ.get("DB_POOL_MAX", "10"))

    gemini_api_key: str = os.environ.get("GEMINI_API_KEY", "")

    proxy_dir: str = os.environ.get("PROXY_DIR", ".ingesthub_proxies")

    datasets_root: str = os.environ.get("DATASETS_ROOT", "")

    # Self-update settings (leave empty to disable)
    update_repo: str = os.environ.get("UPDATE_REPO", "")

    # GitHub App authentication (preferred — auto-rotating tokens, org-scoped)
    github_app_id: str = os.environ.get("GITHUB_APP_ID", "")
    github_private_key_path: str = os.environ.get("GITHUB_PRIVATE_KEY_PATH", "")
    github_installation_id: str = os.environ.get("GITHUB_INSTALLATION_ID", "")

    # Auto-update check interval in seconds (default 300 = 5 min, 0 = disabled)
    auto_update_interval: int = int(os.environ.get("AUTO_UPDATE_INTERVAL", "300"))


settings = Settings()
