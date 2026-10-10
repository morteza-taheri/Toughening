"""TOUGHENING MACHINE — PC-side admin panel backend (DR-50).

HTTP Basic Auth, loopback-only, PBKDF2-HMAC-SHA256
password storage. The admin password is never stored in
code, in the specification, or in any tracked file.

First run (config missing) — now triggered at server start-up
(previously nothing ever created the file, so every admin request
returned 503):
  1. Read TOUGHENING_ADMIN_DEFAULT_PASS from the environment.
  2. If unset, generate a random 16-character password and
     write it ONCE to pc/admin_actions.log (the only place it is
     ever written; the audit viewer redacts it).
  3. Hash the chosen password with PBKDF2-HMAC-SHA256
     (600,000 iterations, 16-byte salt, 32-byte dklen) and
     persist pc/admin.config.json.

Review fixes (2026-10-10):
  * the username is now verified (any username used to be accepted);
  * the loopback check runs BEFORE authentication (no remote brute force);
  * successful verifications are cached for a few minutes, because Basic
    Auth re-sends the password on every request and 600 000 PBKDF2 rounds
    per request made the panel slow;
  * status / backup use the configured database path instead of the
    hard-coded default, last_backup works (it called a non-existent
    function), backup_dir_available reports real availability.

Read-only database tools added for the admin GUI (DR-50 MVP extension):
per-type statistics, integrity check, record browser, backup download and
audit-log viewer. Purge, record deletion, restore, retention changes and
password change from the UI remain DEFERRED (DR-50).
"""

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import string
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple

from fastapi.requests import Request

CONFIG_PATH = Path(__file__).parent / "admin.config.json"
LOG_PATH = Path(__file__).parent / "admin_actions.log"
ITERATIONS = 600_000
SALT_BYTES = 16
DKLEN = 32
DEFAULT_USERNAME = "admin"
AUTH_CACHE_SECONDS = 300
REALM_HEADER = {"WWW-Authenticate": 'Basic realm="toughening-admin"'}
BACKUP_NAME_RE = re.compile(r"^backup_\d{8}_\d{6}\.sqlite$")

log = None

# (username, sha256(password), stored hash) -> expiry (monotonic seconds)
_auth_cache: dict = {}
_auth_lock = threading.Lock()


def _set_log(logger):
    global log
    log = logger


def make_password_hash(password: str) -> Tuple[bytes, bytes]:
    """Generate a random salt and hash password using PBKDF2-HMAC-SHA256.
    Returns (salt_bytes, hash_bytes)."""
    salt = secrets.token_bytes(SALT_BYTES)
    hash_bytes = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        ITERATIONS,
        dklen=DKLEN,
    )
    return salt, hash_bytes


def verify_password_hash(stored_salt: bytes, stored_hash: bytes, password: str) -> bool:
    """Verify a password against a stored salt and hash."""
    computed_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        stored_salt,
        ITERATIONS,
        dklen=DKLEN,
    )
    return hmac.compare_digest(stored_hash, computed_hash)


def password_hash_to_base64(salt: bytes, hash_bytes: bytes) -> str:
    """Encode salt:hash as base64 for storage in JSON config."""
    return base64.b64encode(salt + hash_bytes).decode("ascii")


def password_hash_from_base64(encoded: str) -> Tuple[bytes, bytes]:
    """Decode base64 into (salt, hash_bytes)."""
    decoded = base64.b64decode(encoded)
    if len(decoded) < SALT_BYTES + DKLEN:
        raise ValueError("Invalid password hash format")
    salt = decoded[:SALT_BYTES]
    hash_bytes = decoded[SALT_BYTES:SALT_BYTES + DKLEN]
    return salt, hash_bytes


def _utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_or_create_config() -> dict:
    """Load admin config or create if missing.

    If config exists, returns it unchanged.
    If no config and no TOUGHENING_ADMIN_DEFAULT_PASS env var,
    generates a random password and writes it ONCE to the audit log.
    Returns {username, username_hash, created}. (`username_hash` is the
    historical key name of the PASSWORD hash; kept for compatibility.)
    """
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            if cfg.get("username_hash") and cfg.get("created"):
                cfg.setdefault("username", DEFAULT_USERNAME)
                return cfg
        except Exception:
            pass

    default_pass = os.environ.get("TOUGHENING_ADMIN_DEFAULT_PASS")
    if default_pass:
        salt, hash_bytes = make_password_hash(default_pass)
        cfg = {
            "username": DEFAULT_USERNAME,
            "username_hash": password_hash_to_base64(salt, hash_bytes),
            "created": _utc_stamp(),
        }
    else:
        alphabet = string.ascii_letters + string.digits
        password = "".join(secrets.choice(alphabet) for _ in range(16))
        salt, hash_bytes = make_password_hash(password)
        cfg = {
            "username": DEFAULT_USERNAME,
            "username_hash": password_hash_to_base64(salt, hash_bytes),
            "created": _utc_stamp(),
        }
        admin_log("config_created", f"generated_password={password}", user=DEFAULT_USERNAME)

    try:
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        raise RuntimeError(f"Failed to write admin config: {e}")

    return cfg


def ensure_config() -> bool:
    """Create the admin config at server start-up if it is missing.

    Returns True when a usable config exists afterwards. Never raises.
    """
    try:
        load_or_create_config()
        return CONFIG_PATH.exists()
    except Exception:
        return False


def verify_credentials(username: str, password: str) -> bool:
    """Verify username/password against stored hash.

    Username must exactly match the configured one (used for basic auth).
    """
    try:
        cfg = load_or_create_config()
        expected_user = str(cfg.get("username") or DEFAULT_USERNAME)
        stored = cfg["username_hash"]
    except Exception:
        return False
    user_ok = hmac.compare_digest(username.encode("utf-8"), expected_user.encode("utf-8"))
    digest = hashlib.sha256(password.encode("utf-8")).hexdigest()
    key = (username, digest, stored)
    now = time.monotonic()
    with _auth_lock:
        expiry = _auth_cache.get(key)
        if expiry is not None and expiry > now and user_ok:
            return True
    try:
        salt, stored_hash = password_hash_from_base64(stored)
        password_ok = verify_password_hash(salt, stored_hash, password)
    except Exception:
        return False
    if user_ok and password_ok:
        with _auth_lock:
            # keep the cache tiny and drop expired entries
            for k in [k for k, v in _auth_cache.items() if v <= now]:
                _auth_cache.pop(k, None)
            if len(_auth_cache) > 16:
                _auth_cache.clear()
            _auth_cache[key] = now + AUTH_CACHE_SECONDS
        return True
    return False


def clear_auth_cache() -> None:
    with _auth_lock:
        _auth_cache.clear()


def parse_basic_auth(header: str) -> Optional[Tuple[str, str]]:
    """Parse HTTP Basic Auth header. Returns (username, password) or None."""
    if not header or not header.startswith("Basic "):
        return None
    try:
        decoded = base64.b64decode(header.split(" ", 1)[1]).decode("utf-8")
        parts = decoded.split(":", 1)
        if len(parts) == 2:
            return parts[0], parts[1]
        return parts[0], ""
    except Exception:
        return None


def require_admin(request: Request):
    """FastAPI dependency to enforce HTTP Basic Auth.

    Returns credentials dict if auth succeeds; raises 401 otherwise.
    Raises 503 if config cannot be loaded at all.
    """
    from fastapi import HTTPException, status

    try:
        config_ok = CONFIG_PATH.exists()
    except Exception:
        config_ok = False
    if not config_ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin config unavailable",
        )

    auth_header = request.headers.get("Authorization")
    parsed = parse_basic_auth(auth_header) if auth_header else None
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers=REALM_HEADER,
        )

    username, password = parsed
    if not verify_credentials(username, password):
        admin_log("auth_failed", detail="bad_credentials", user=username[:32] or "?")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers=REALM_HEADER,
        )

    return {"username": username}


def require_local_admin(request: Request):
    """Loopback check FIRST, then Basic Auth.

    The old endpoints authenticated before checking the client address, so
    a remote client could still probe passwords (and burn CPU on PBKDF2).
    `is_loopback` is looked up through the module so tests can patch it.
    """
    from fastapi import HTTPException, status
    import pc.admin as _self

    if not _self.is_loopback(request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access restricted to loopback",
        )
    return require_admin(request)


def is_loopback(request) -> bool:
    """Check if request origin is loopback (allow admin only locally)."""
    client_host = request.client.host if request.client else None
    return client_host in ("127.0.0.1", "::1", "localhost")


def admin_log(action: str, detail: str = "", user: str = "admin"):
    """Append an audit log entry (one line, plain text).

    Format: "2026-10-09T14:23:45Z  user=admin  action=login  detail=ok"
    Never logs a password or hash, except the one-time generated password
    on first run (DR-50).
    """
    entry = f"{_utc_stamp()}  user={user}  action={action}  detail={detail}"
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(entry + "\n")
    except Exception:
        pass


def audit_tail(lines: int = 200) -> dict:
    """Return the last `lines` audit entries, newest first, with the
    one-time generated password redacted."""
    lines = max(1, min(int(lines), 2000))
    entries = []
    try:
        with open(LOG_PATH, "r", encoding="utf-8", errors="replace") as f:
            raw = f.readlines()[-lines:]
    except OSError:
        raw = []
    for line in reversed(raw):
        line = re.sub(r"generated_password=\S+", "generated_password=<redacted>", line.rstrip("\n"))
        parts = re.split(r"\s{2,}", line)
        item = {"raw": line}
        if parts:
            item["ts"] = parts[0]
        for part in parts[1:]:
            if "=" in part:
                k, v = part.split("=", 1)
                item[k] = v
        entries.append(item)
    return {"log_path": str(LOG_PATH), "entries": entries}


def get_config_settings() -> dict:
    from pc import config as pc_config
    return pc_config.describe_config()


def update_config_settings(updates: dict) -> dict:
    from pc import config as pc_config
    result = pc_config.update_file_config(updates)
    admin_log("settings_update", detail="keys=" + ",".join(sorted(updates)))
    return {"config": pc_config.describe_config(), "effective": result}


# ---------------------------------------------------------------------------
# Database helpers (read-only)
# ---------------------------------------------------------------------------

def _db_path() -> str:
    from pc import db as pc_db
    return pc_db.get_db_path()


def _open():
    from pc import db as pc_db
    conn = pc_db.open_db(_db_path())
    pc_db.init_db(conn)
    return conn


def get_record_count(conn) -> int:
    """Return total number of records in the database."""
    row = conn.execute("SELECT COUNT(*) FROM records").fetchone()
    return int(row[0]) if row else 0


def _backup_files(backup_dir: Optional[str]) -> list:
    """Return [{name, path, size_bytes, mtime_ms}] for real backup files."""
    out = []
    if not backup_dir or not os.path.isdir(backup_dir):
        return out
    for fname in sorted(os.listdir(backup_dir)):
        fpath = os.path.join(backup_dir, fname)
        if not os.path.isfile(fpath):
            continue
        try:
            out.append({
                "name": fname,
                "path": fpath,
                "size_bytes": os.path.getsize(fpath),
                "mtime_ms": int(os.path.getmtime(fpath) * 1000),
                "is_backup": bool(BACKUP_NAME_RE.match(fname)),
            })
        except OSError:
            pass
    return out


def get_status():
    """Return status dict: {db_path, db_size_bytes, record_count, record_types,
    backup_dir, backup_dir_available, last_backup, log_path, config_path}.

    Read-only on the records table.
    """
    from pc import db as pc_db
    import pc.config
    import pc.backup

    db_path = _db_path()
    conn = _open()
    try:
        records_total = get_record_count(conn)
        try:
            rows = conn.execute("SELECT DISTINCT record_type FROM records").fetchall()
            record_types = sorted(r[0] for r in rows if r[0])
        except Exception:
            record_types = []
    finally:
        pc_db.close_db(conn)

    try:
        db_size = os.path.getsize(db_path) if os.path.exists(db_path) else 0
    except Exception:
        db_size = 0

    backup_dir = None
    available = False
    last_backup = None
    last_backup_ms = None
    try:
        cfg = pc.config.load_config()
        backup_dir = cfg.get("backup_dir")
        available = bool(backup_dir) and pc.backup.is_destination_available(backup_dir)
        files = [f for f in _backup_files(backup_dir) if f["is_backup"]]
        if files:
            latest = max(files, key=lambda f: f["mtime_ms"])
            last_backup = latest["path"]
            last_backup_ms = latest["mtime_ms"]
    except Exception:
        last_backup = None

    return {
        "db_path": db_path,
        "db_size_bytes": db_size,
        "record_count": records_total,
        "record_types": record_types,
        "backup_dir": backup_dir,
        "backup_dir_available": available,
        "last_backup": last_backup,
        "last_backup_ms": last_backup_ms,
        "log_path": str(LOG_PATH),
        "config_path": str(CONFIG_PATH),
    }


def get_backups():
    """List backups dict: {backup_dir, available, backups: [{name, size_bytes, mtime_ms}]

    If backup_dir unset: {backup_dir: None, available: False, backups: []}
    """
    import pc.config
    import pc.backup

    cfg: dict = {}
    try:
        cfg = pc.config.load_config()
        backup_dir = cfg.get("backup_dir")
    except Exception:
        backup_dir = None
    available = bool(backup_dir) and os.path.isdir(backup_dir)
    backups = [
        {"name": f["name"], "size_bytes": f["size_bytes"], "mtime_ms": f["mtime_ms"],
         "is_backup": f["is_backup"]}
        for f in _backup_files(backup_dir)
    ]
    return {
        "backup_dir": backup_dir,
        "available": available,
        "writable": bool(backup_dir) and pc.backup.is_destination_available(backup_dir),
        "retention": cfg.get("backup_retention") if backup_dir else None,
        "backup_hour": cfg.get("backup_hour") if backup_dir else None,
        "backups": backups,
    }


def backup_file_path(name: str) -> Optional[str]:
    """Return the absolute path of a backup file for download, or None.

    Only names produced by pc.backup (backup_YYYYmmdd_HHMMSS.sqlite) inside
    the configured backup_dir are served: no path traversal.
    """
    import pc.config
    if not BACKUP_NAME_RE.match(name or ""):
        return None
    backup_dir = pc.config.load_config().get("backup_dir")
    if not backup_dir:
        return None
    root = os.path.realpath(backup_dir)
    path = os.path.realpath(os.path.join(root, name))
    if os.path.dirname(path) != root or not os.path.isfile(path):
        return None
    return path


def trigger_backup():
    """Trigger a backup.

    If backup_dir unset -> raises ValueError("Backup destination not available").
    Otherwise calls pc.backup.make_backup(...). Returns {"path", "size_bytes"}.
    """
    from pc import db as pc_db
    import pc.backup
    import pc.config

    try:
        cfg = pc.config.load_config()
        backup_dir = cfg.get("backup_dir")
    except Exception:
        cfg = {}
        backup_dir = None

    if not backup_dir or not pc.backup.is_destination_available(backup_dir):
        raise ValueError("backup not configured")

    db_path = _db_path()
    # Make sure the source exists (an empty but valid DB is still backed up).
    conn = _open()
    pc_db.close_db(conn)
    try:
        result_path = pc.backup.make_backup(db_path, backup_dir)
    except Exception as e:
        raise ValueError(f"Backup failed: {e}")
    if not result_path:
        raise ValueError("Backup failed (see server log)")
    deleted = 0
    try:
        retention = int(cfg.get("backup_retention") or pc.backup.DEFAULT_RETENTION)
        deleted = pc.backup.enforce_retention(backup_dir, retention)
    except Exception:
        deleted = 0
    return {
        "path": result_path,
        "size_bytes": os.path.getsize(result_path),
        "deleted_count": deleted,
    }


def db_overview() -> dict:
    """Per-type statistics of the records table plus file sizes."""
    from pc import db as pc_db
    db_path = _db_path()
    conn = _open()
    try:
        rows = conn.execute(
            "SELECT record_type, COUNT(*), MIN(pc_received_ms), MAX(pc_received_ms) "
            "FROM records GROUP BY record_type ORDER BY record_type"
        ).fetchall()
        demo = conn.execute(
            "SELECT COUNT(*) FROM records WHERE record_id LIKE 'demo:%'"
        ).fetchone()[0]
        version = conn.execute("SELECT MAX(version) FROM schema_version").fetchone()[0]
        page_size = conn.execute("PRAGMA page_size").fetchone()[0]
        page_count = conn.execute("PRAGMA page_count").fetchone()[0]
        free_pages = conn.execute("PRAGMA freelist_count").fetchone()[0]
        journal = conn.execute("PRAGMA journal_mode").fetchone()[0]
    finally:
        pc_db.close_db(conn)

    def size(p):
        try:
            return os.path.getsize(p) if os.path.exists(p) else 0
        except OSError:
            return 0

    types = [
        {"record_type": r[0], "count": int(r[1]), "first_ms": r[2], "last_ms": r[3]}
        for r in rows
    ]
    return {
        "db_path": db_path,
        "db_size_bytes": size(db_path),
        "wal_size_bytes": size(db_path + "-wal"),
        "schema_version": version,
        "journal_mode": journal,
        "page_size": page_size,
        "page_count": page_count,
        "free_pages": free_pages,
        "record_count": sum(t["count"] for t in types),
        "demo_record_count": int(demo),
        "types": types,
    }


def db_integrity_check() -> dict:
    """Run PRAGMA quick_check (read-only)."""
    from pc import db as pc_db
    started = time.monotonic()
    conn = _open()
    try:
        rows = conn.execute("PRAGMA quick_check").fetchall()
    finally:
        pc_db.close_db(conn)
    messages = [r[0] for r in rows]
    return {
        "ok": messages == ["ok"],
        "messages": messages[:50],
        "elapsed_ms": int((time.monotonic() - started) * 1000),
    }


def list_records(record_type: Optional[str] = None, search: Optional[str] = None,
                 limit: int = 50, offset: int = 0) -> dict:
    """Browse records newest first (read-only)."""
    from pc import db as pc_db
    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))
    where, params = [], []
    if record_type:
        where.append("record_type = ?")
        params.append(record_type)
    if search:
        where.append("(record_id LIKE ? OR payload_json LIKE ?)")
        like = f"%{search}%"
        params.extend([like, like])
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    conn = _open()
    try:
        total = conn.execute(f"SELECT COUNT(*) FROM records{clause}", params).fetchone()[0]
        rows = conn.execute(
            "SELECT record_id, record_type, pc_received_ms, payload_json, schema_version "
            f"FROM records{clause} ORDER BY pc_received_ms DESC, record_id DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()
    finally:
        pc_db.close_db(conn)
    items = []
    for r in rows:
        try:
            payload = json.loads(r[3])
        except ValueError:
            payload = r[3]
        items.append({
            "record_id": r[0],
            "record_type": r[1],
            "pc_received_ms": r[2],
            "schema_version": r[4],
            "payload": payload,
        })
    return {"total": int(total), "limit": limit, "offset": offset, "items": items}
