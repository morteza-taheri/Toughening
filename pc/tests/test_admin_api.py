"""TOUGHENING MACHINE — admin API tests (DR-50, Phase 2C-3i).

8 tests covering:
  - require_admin: wrong password -> 401, config load failure -> 503
  - is_loopback restriction -> 403
  - /admin returns HTML + Cache-Control: no-store
  - /api/admin/status returns 200 + record_count
  - /api/admin/backups returns 200 with backup list
  - /api/admin/backup triggers backup when configured
  - /api/admin/logout returns 401 + WWW-Authenticate
  - non-loopback request -> 403
"""

import base64
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from pc.server import app
from pc.admin import (
    make_password_hash,
    password_hash_from_base64,
    password_hash_to_base64,
    verify_password_hash,
)

CLIENT = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate_admin_config(tmp_path, monkeypatch):
    """Isolate admin.config.json and admin_actions.log in temp directory."""
    import pc.admin as admin_module

    admin_dir = tmp_path / "pc"
    admin_dir.mkdir(parents=True, exist_ok=True)
    config_file = admin_dir / "admin.config.json"
    log_file = admin_dir / "admin_actions.log"

    original_config_path = admin_module.CONFIG_PATH
    original_log_path = admin_module.LOG_PATH

    monkeypatch.setattr(admin_module, "CONFIG_PATH", config_file)
    admin_module.CONFIG_PATH = config_file
    admin_module.LOG_PATH = log_file

    yield config_file, log_file

    admin_module.CONFIG_PATH = original_config_path
    admin_module.LOG_PATH = original_log_path


@pytest.fixture(autouse=True)
def _patch_is_loopback():
    """Patch is_loopback to return True for all tests (TestClient doesn't set loopback host)."""
    with patch("pc.admin.is_loopback", return_value=True):
        yield


@pytest.fixture
def admin_password():
    return "testadmin123"


@pytest.fixture
def configured_client(_isolate_admin_config, admin_password, monkeypatch):
    config_file, _ = _isolate_admin_config
    client = TestClient(app)

    monkeypatch.setenv("TOUGHENING_ADMIN_DEFAULT_PASS", admin_password)

    from pc.admin import load_or_create_config

    load_or_create_config()

    def _get_auth_header():
        token = base64.b64encode(f"admin:{admin_password}".encode()).decode()
        return {"Authorization": f"Basic {token}"}

    return client, _get_auth_header


class TestPasswordHash:
    def test_make_password_hash_returns_salt_and_hash(self):
        salt, hash_bytes = make_password_hash("password")
        assert len(salt) == 16
        assert len(hash_bytes) == 32

    def test_password_hash_to_base64_roundtrip(self, admin_password):
        salt, hash_bytes = make_password_hash(admin_password)
        encoded = password_hash_to_base64(salt, hash_bytes)
        decoded_salt, decoded_hash = password_hash_from_base64(encoded)
        assert decoded_salt == salt
        assert decoded_hash == hash_bytes

    def test_verify_password_hash_accepts_correct_password(self, admin_password):
        salt, hash_bytes = make_password_hash(admin_password)
        assert verify_password_hash(salt, hash_bytes, admin_password) is True

    def test_verify_password_hash_rejects_wrong_password(self, admin_password):
        salt, hash_bytes = make_password_hash(admin_password)
        assert verify_password_hash(salt, hash_bytes, "wrong") is False


class TestRequireAdmin:
    """Tests for require_admin: 401 on failure, 503 on config load failure."""

    def test_wrong_password_returns_401(self, configured_client):
        client, _ = configured_client
        bad_token = base64.b64encode(b"admin:wrongpass").decode()
        r = client.get("/api/admin/status", headers={"Authorization": f"Basic {bad_token}"})
        assert r.status_code == 401
        assert "WWW-Authenticate" in r.headers
        assert 'Basic realm="toughening-admin"' in r.headers["WWW-Authenticate"]

    def test_missing_config_returns_503(self, _isolate_admin_config, monkeypatch):
        import pc.admin as admin_module

        original = admin_module.CONFIG_PATH
        bad_config = Path("/nonexistent/path/admin.config.json")
        admin_module.CONFIG_PATH = bad_config
        try:
            r = CLIENT.get("/api/admin/status",
                           headers={"Authorization": "Basic " + base64.b64encode(b"admin:test").decode()})
            assert r.status_code == 503
        finally:
            admin_module.CONFIG_PATH = original

    def test_logout_returns_401_and_www_authenticate(self, configured_client):
        client, get_auth = configured_client
        r = client.post("/api/admin/logout", headers=get_auth())
        assert r.status_code == 401
        assert "WWW-Authenticate" in r.headers
        assert 'Basic realm="toughening-admin"' in r.headers["WWW-Authenticate"]


class TestAdminEndpoints:
    """Tests for the admin endpoints and loopback restriction."""

    def test_status_returns_200_and_record_count(self, configured_client):
        client, get_auth = configured_client
        r = client.get("/api/admin/status", headers=get_auth())
        assert r.status_code == 200
        data = r.json()
        assert "record_count" in data
        assert isinstance(data["record_count"], int)

    def test_backups_returns_200_with_backup_list(self, configured_client):
        client, get_auth = configured_client
        r = client.get("/api/admin/backups", headers=get_auth())
        assert r.status_code == 200
        data = r.json()
        assert "backups" in data
        assert "backup_dir" in data
        assert "available" in data

    def test_non_loopback_returns_403(self, configured_client):
        client, get_auth = configured_client
        with patch("pc.admin.is_loopback", return_value=False):
            r = client.get("/api/admin/status", headers=get_auth())
            assert r.status_code == 403

    def test_admin_page_returns_html_with_cache_control_no_store(self, configured_client):
        client, get_auth = configured_client
        r = client.get("/admin", headers=get_auth())
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert "no-store" in r.headers.get("Cache-Control", "")
        assert r.headers["Cache-Control"] == "no-store"

    def test_admin_page_returns_401_without_auth(self, configured_client):
        client, _ = configured_client
        r = client.get("/admin")
        assert r.status_code == 401


class TestTriggerBackup:
    def test_trigger_backup_when_configured(self, configured_client, monkeypatch, tmp_path):
        client, get_auth = configured_client
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            monkeypatch.setenv("TOUGHENING_BACKUP_DIR", tmp)
            r = client.post("/api/admin/backup", headers=get_auth())
            assert r.status_code == 200
            data = r.json()
            assert "path" in data
            assert data["path"].endswith(".sqlite")
