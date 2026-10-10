"""TOUGHENING MACHINE — configuration loader (Phase 2C Stage 2C-3h, DR-18).

Sources, in priority order (highest first):

  1. Environment variables
  2. JSON file ``pc/config.json`` (if present)
  3. Hard-coded defaults (lowest priority)

No secrets, no credentials, no authentication. Only file paths and
schedule numbers are loaded here.

Keys relevant to Stage 2C-3h:

  db_path           SQLite database path
  backup_dir        destination directory for daily backups
  backup_hour       0-23 (local hour of the daily run)
  backup_retention  number of backups to keep

DR-18 leaves the run-time default hour OPEN. The placeholder value 2
below is NOT a final decision — it exists only so the scheduler has
something to read until the operator sets it. Marked OPEN in comments.
"""

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Optional

# Placeholder default hour. DR-18 leaves the schedule hour OPEN; this is
# only a stand-in until the operator configures it. Do not treat 2 as
# authoritative.
DEFAULT_BACKUP_HOUR = 2
DEFAULT_BACKUP_RETENTION = 30
DEFAULT_DB_PATH = "pc/toughening.db"

_CONFIG_FILE = Path(__file__).resolve().parent / "config.json"

_ENV_KEYS = {
    "db_path": "TOUGHENING_DB_PATH",
    "backup_dir": "TOUGHENING_BACKUP_DIR",
    "backup_hour": "TOUGHENING_BACKUP_HOUR",
    "backup_retention": "TOUGHENING_BACKUP_RETENTION",
}

_DEFAULTS = {
    "db_path": DEFAULT_DB_PATH,
    "backup_dir": None,
    "backup_hour": DEFAULT_BACKUP_HOUR,
    "backup_retention": DEFAULT_BACKUP_RETENTION,
}


def _coerce(key: str, value: Any) -> Any:
    """Coerce a raw string value to the type expected for `key`."""
    if value is None:
        return None
    if key in ("backup_hour", "backup_retention"):
        try:
            return int(value)
        except (TypeError, ValueError):
            return _DEFAULTS[key]
    return value


def _load_file_config() -> dict:
    """Load pc/config.json if present and valid; otherwise {}."""
    try:
        with open(_CONFIG_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def load_config() -> dict:
    """Return the merged configuration dict.

    Priority: environment > pc/config.json > defaults.
    """
    file_cfg = _load_file_config()
    merged = dict(_DEFAULTS)
    for key in _DEFAULTS:
        if key in file_cfg and file_cfg[key] is not None:
            merged[key] = _coerce(key, file_cfg[key])
    for key, env_name in _ENV_KEYS.items():
        env_val = os.environ.get(env_name)
        if env_val is not None and env_val != "":
            merged[key] = _coerce(key, env_val)
    return merged


def get(key: str, default: Optional[Any] = None) -> Any:
    """Return one config value, falling back to `default`."""
    return load_config().get(key, default)


def update_file_config(updates: dict) -> dict:
    """Persist editable runtime settings atomically.

    Environment variables intentionally remain higher priority.  The caller
    can use ``environment_overrides`` from ``describe_config`` to explain
    why a saved value is not currently effective.
    """
    allowed = set(_DEFAULTS)
    unknown = set(updates) - allowed
    if unknown:
        raise ValueError("unsupported setting: " + sorted(unknown)[0])
    current = _load_file_config()
    for key, value in updates.items():
        if value is None or value == "":
            current.pop(key, None)
        else:
            coerced = _coerce(key, value)
            if key == "backup_hour" and not 0 <= coerced <= 23:
                raise ValueError("backup_hour must be between 0 and 23")
            if key == "backup_retention" and not 1 <= coerced <= 10000:
                raise ValueError("backup_retention must be between 1 and 10000")
            if key in ("db_path", "backup_dir") and not isinstance(coerced, str):
                raise ValueError(f"{key} must be a string")
            current[key] = coerced
    _CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix=".config.", suffix=".tmp",
                                      dir=str(_CONFIG_FILE.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(current, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(temp_path, _CONFIG_FILE)
    finally:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass
    return load_config()


def describe_config() -> dict:
    """Return effective values plus which values are controlled by env vars."""
    effective = load_config()
    file_cfg = _load_file_config()
    items = {}
    for key, env_name in _ENV_KEYS.items():
        items[key] = {
            "value": effective.get(key),
            "file_value": file_cfg.get(key),
            "environment": env_name if os.environ.get(env_name) not in (None, "") else None,
            "editable": os.environ.get(env_name) in (None, ""),
        }
    return {"settings": items, "config_file": str(_CONFIG_FILE)}