"""System endpoints, version comparison, and auto-update tests."""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from api.config import settings
from api.routers import system as system_mod
from api.routers.system import (
    LatestRelease,
    _check_and_update,
    _compare_versions,
)
from api.services.github_auth import is_configured

# ---------------------------------------------------------------------------
# /api/system/info
# ---------------------------------------------------------------------------


async def test_system_info_returns_version(client: AsyncClient):
    resp = await client.get("/api/system/info")
    assert resp.status_code == 200
    data = resp.json()
    assert "version" in data
    assert isinstance(data["update_enabled"], bool)
    assert "latest" in data
    assert "update_available" in data


async def test_system_info_update_disabled_without_repo(client: AsyncClient):
    """When UPDATE_REPO is not set, update_enabled is False and latest is null."""
    resp = await client.get("/api/system/info")
    data = resp.json()
    assert data["update_enabled"] is False
    assert data["latest"] is None
    assert data["update_available"] is False


# ---------------------------------------------------------------------------
# _compare_versions (pure function)
# ---------------------------------------------------------------------------


class TestCompareVersions:
    def test_newer_major(self):
        assert _compare_versions("1.0.0", "2.0.0") is True

    def test_newer_minor(self):
        assert _compare_versions("1.0.0", "1.1.0") is True

    def test_newer_patch(self):
        assert _compare_versions("1.0.0", "1.0.1") is True

    def test_same_version(self):
        assert _compare_versions("1.0.0", "1.0.0") is False

    def test_older_version(self):
        assert _compare_versions("2.0.0", "1.0.0") is False

    def test_strips_v_prefix(self):
        assert _compare_versions("v1.0.0", "v2.0.0") is True

    def test_mixed_v_prefix(self):
        assert _compare_versions("v1.0.0", "2.0.0") is True

    def test_non_semver_returns_false(self):
        """Unparseable versions never trigger update (avoid false alarms)."""
        assert _compare_versions("abc", "def") is False
        assert _compare_versions("abc", "abc") is False

    def test_dev_vs_release(self):
        assert _compare_versions("0.0.0-dev", "1.0.0") is True

    def test_pep440_dev_vs_release(self):
        assert _compare_versions("0.0.1.dev13+gabc1234", "1.0.0") is True


# ---------------------------------------------------------------------------
# GitHub App auth (is_configured)
# ---------------------------------------------------------------------------


class TestGitHubAppAuth:
    def test_not_configured_by_default(self):
        """Without env vars, GitHub App auth is not configured."""
        assert is_configured() is False

    def test_requires_all_three_settings(self):
        """is_configured needs app_id, private_key_path, and installation_id."""
        from api.config import settings

        # Default settings have empty strings for all three
        assert settings.github_app_id == ""
        assert settings.github_private_key_path == ""
        assert settings.github_installation_id == ""


# ---------------------------------------------------------------------------
# Auto-update (_check_and_update)
# ---------------------------------------------------------------------------

_RELEASE = LatestRelease(
    version="1.0.0",
    tag_name="v1.0.0",
    published_at="2025-01-01T00:00:00Z",
    html_url="https://github.com/test/repo/releases/tag/v1.0.0",
    assets=[],
)

_SUCCESS = MagicMock(returncode=0, stderr="")
_FAILURE = MagicMock(returncode=1, stderr="fatal: error")


class TestCheckAndUpdate:
    """Tests for the single update check cycle."""

    @pytest.fixture(autouse=True)
    def _reset_state(self):
        """Reset module-level auto-update state between tests."""
        system_mod._last_failed_tag = ""
        system_mod._last_failed_at = 0.0
        system_mod._cached_release = None
        system_mod._cached_at = 0.0

    @patch("api.routers.system._restart")
    @patch("api.routers.system._download_frontend_dist", new_callable=AsyncMock)
    @patch("api.routers.system._run_cmd", return_value=_SUCCESS)
    @patch("api.routers.system._fetch_latest_release", return_value=_RELEASE)
    @patch("api.routers.system._get_version", return_value="0.1.0")
    async def test_applies_newer_version(self, mock_ver, mock_fetch, mock_cmd, mock_dl, mock_restart):
        """When a newer version is available, runs git fetch + checkout + download + restart."""
        await _check_and_update()

        assert mock_cmd.call_count == 2
        # First call: git fetch
        fetch_args = mock_cmd.call_args_list[0][0][0]
        assert fetch_args[:3] == ["git", "fetch", "origin"]
        assert "v1.0.0" in fetch_args
        # Second call: git checkout
        checkout_args = mock_cmd.call_args_list[1][0][0]
        assert checkout_args == ["git", "checkout", "v1.0.0"]

        mock_dl.assert_awaited_once()
        mock_restart.assert_called_once()

    @patch("api.routers.system._run_cmd")
    @patch("api.routers.system._fetch_latest_release", return_value=_RELEASE)
    @patch("api.routers.system._get_version", return_value="1.0.0")
    async def test_skips_when_up_to_date(self, mock_ver, mock_fetch, mock_cmd):
        """When current version matches latest, no commands are run."""
        await _check_and_update()
        mock_cmd.assert_not_called()

    @patch("api.routers.system._run_cmd")
    @patch("api.routers.system._fetch_latest_release", return_value=None)
    async def test_skips_when_no_release(self, mock_fetch, mock_cmd):
        """When GitHub returns no release, no commands are run."""
        await _check_and_update()
        mock_cmd.assert_not_called()

    @patch("api.routers.system._restart")
    @patch("api.routers.system._run_cmd", return_value=_FAILURE)
    @patch("api.routers.system._fetch_latest_release", return_value=_RELEASE)
    @patch("api.routers.system._get_version", return_value="0.1.0")
    async def test_records_failure_on_git_error(self, mock_ver, mock_fetch, mock_cmd, mock_restart):
        """When git fetch fails, the version is recorded for cooldown."""
        await _check_and_update()

        assert system_mod._last_failed_tag == "v1.0.0"
        assert system_mod._last_failed_at > 0
        mock_restart.assert_not_called()

    @patch("api.routers.system._run_cmd")
    @patch("api.routers.system._fetch_latest_release", return_value=_RELEASE)
    @patch("api.routers.system._get_version", return_value="0.1.0")
    async def test_cooldown_skips_recent_failure(self, mock_ver, mock_fetch, mock_cmd):
        """A recently failed version is not retried within the cooldown period."""
        system_mod._last_failed_tag = "v1.0.0"
        system_mod._last_failed_at = time.monotonic()  # Just failed

        await _check_and_update()
        mock_cmd.assert_not_called()

    @patch("api.routers.system._restart")
    @patch("api.routers.system._download_frontend_dist", new_callable=AsyncMock)
    @patch("api.routers.system._run_cmd", return_value=_SUCCESS)
    @patch("api.routers.system._fetch_latest_release", return_value=_RELEASE)
    @patch("api.routers.system._get_version", return_value="0.1.0")
    async def test_retries_after_cooldown_expires(self, mock_ver, mock_fetch, mock_cmd, mock_dl, mock_restart):
        """After cooldown expires, the same version is retried."""
        system_mod._last_failed_tag = "v1.0.0"
        system_mod._last_failed_at = time.monotonic() - system_mod._RETRY_COOLDOWN - 1  # Expired

        await _check_and_update()
        mock_restart.assert_called_once()


class TestAutoUpdateConfig:
    def test_default_interval(self):
        assert settings.auto_update_interval == 300

    def test_interval_override(self):
        """auto_update_interval can be changed at runtime via object.__setattr__."""
        object.__setattr__(settings, "auto_update_interval", 600)
        assert settings.auto_update_interval == 600
        object.__setattr__(settings, "auto_update_interval", 300)  # restore
