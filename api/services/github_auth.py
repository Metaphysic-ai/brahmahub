"""GitHub App authentication for self-update.

Handles JWT creation, installation token exchange, and token caching.
Tokens auto-refresh 5 minutes before expiry.
"""

import json
import logging
import time
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

import jwt  # PyJWT[crypto]

from ..config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Token cache — installation tokens last 1 hour, refresh 5 min before expiry
# ---------------------------------------------------------------------------

_cached_token: str = ""
_cached_expires_at: float = 0.0
_REFRESH_MARGIN = 300  # 5 minutes


def _load_private_key() -> bytes:
    """Load the PEM private key from disk."""
    path = Path(settings.github_private_key_path)
    if not path.exists():
        raise FileNotFoundError(f"GitHub App private key not found: {path}")
    return path.read_bytes()


def _create_jwt() -> str:
    """Create a short-lived JWT for GitHub App authentication.

    JWT claims:
      - iss: GitHub App ID
      - iat: now - 60s (clock drift tolerance)
      - exp: now + 600s (10-minute GitHub maximum)
    """
    private_key = _load_private_key()
    now = int(time.time())
    payload = {
        "iss": settings.github_app_id,
        "iat": now - 60,
        "exp": now + 600,
    }
    return jwt.encode(payload, private_key, algorithm="RS256")


def _exchange_for_installation_token() -> tuple[str, float]:
    """Exchange a JWT for an installation access token.

    POST /app/installations/{id}/access_tokens

    Returns:
        Tuple of (token, expires_at_unix_timestamp).
    """
    jwt_token = _create_jwt()
    url = f"https://api.github.com/app/installations/{settings.github_installation_id}/access_tokens"
    body = json.dumps({"permissions": {"contents": "read"}}).encode()
    req = Request(
        url,
        data=body,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {jwt_token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    token = data["token"]
    expires_at = datetime.fromisoformat(data["expires_at"]).timestamp()

    return token, expires_at


def _ensure_token() -> str:
    """Return a valid installation token, refreshing if needed."""
    global _cached_token, _cached_expires_at

    now = time.time()
    if _cached_token and now < (_cached_expires_at - _REFRESH_MARGIN):
        return _cached_token

    logger.debug("Refreshing GitHub App installation token")
    token, expires_at = _exchange_for_installation_token()
    _cached_token = token
    _cached_expires_at = expires_at

    return _cached_token


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def is_configured() -> bool:
    """Return True if GitHub App credentials are fully configured."""
    return bool(settings.github_app_id and settings.github_private_key_path and settings.github_installation_id)


def get_github_headers(*, accept: str = "application/vnd.github+json") -> dict[str, str]:
    """Return GitHub API headers with installation token auth.

    Raises if GitHub App is not configured.
    """
    if not is_configured():
        raise RuntimeError("GitHub App not configured (GITHUB_APP_ID, GITHUB_PRIVATE_KEY_PATH, GITHUB_INSTALLATION_ID)")
    token = _ensure_token()
    return {
        "Accept": accept,
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }
