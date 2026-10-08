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