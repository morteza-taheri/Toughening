"""TOUGHENING MACHINE — PC-side admin panel backend (DR-50).

HTTP Basic Auth, loopback-only, PBKDF2-HMAC-SHA256
password storage. The admin password is never stored in
code, in the specification, or in any tracked file.

First run (config missing):
  1. Read TOUGHENING_ADMIN_DEFAULT_PASS from the environment.
  2. If unset, generate a random 16-character password and
     write it ONCE to pc/admin_actions.log.
  3. Hash the chosen password with PBKDF2-HMAC-SHA256
     (600,000 iterations, 16-byte salt, 32-byte dklen) and
     persist pc/admin.config.json.
"""

from pathlib import Path
from typing import Optional, Tuple
from fastapi.requests import Request

CONFIG_PATH = Path(__file__).parent / "admin.config.json"
LOG_PATH = Path(__file__).parent / "admin_actions.log"
ITERATIONS = 600_000
SALT_BYTES = 16
DKLEN = 32

log = None


def _set_log(logger):
    global log
    log = logger


def make_password_hash(password: str) -> Tuple[bytes, bytes]:
    """Generate a random salt and hash password using PBKDF2-HMAC-SHA256.
    Returns (salt_bytes, hash_bytes)."""
    import hashlib, secrets
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
    import hashlib, hmac
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
    import base64
    return base64.b64encode(salt + hash_bytes).decode("ascii")


def password_hash_from_base64(encoded: str) -> Tuple[bytes, bytes]:
    """Decode base64 into (salt, hash_bytes)."""
    import base64
    decoded = base64.b64decode(encoded)
    if len(decoded) < SALT_BYTES + DKLEN:
        raise ValueError("Invalid password hash format")
    salt = decoded[:SALT_BYTES]
    hash_bytes = decoded[SALT_BYTES:SALT_BYTES + DKLEN]
    return salt, hash_bytes


def load_or_create_config() -> dict:
    """Load admin config or create if missing.

    If config exists, returns it unchanged.
    If no config and no TOUGHENING_ADMIN_DEFAULT_PASS env var,
    generates a random password and writes it ONCE to the audit log.
    Returns {username_hash, created}.
    """
    import json, os, time, string, secrets

    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            if cfg.get("username_hash") and cfg.get("created"):
                return cfg
        except Exception:
            pass

    default_pass = os.environ.get("TOUGHENING_ADMIN_DEFAULT_PASS")
    if default_pass:
        salt, hash_bytes = make_password_hash(default_pass)
        cfg = {
            "username_hash": password_hash_to_base64(salt, hash_bytes),
            "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    else:
        alphabet = string.ascii_letters + string.digits
        password = "".join(secrets.choice(alphabet) for _ in range(16))
        salt, hash_bytes = make_password_hash(password)
        cfg = {
            "username_hash": password_hash_to_base64(salt, hash_bytes),
            "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        admin_log("config_created", f"generated_password={password}", user="admin")

    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        raise RuntimeError(f"Failed to write admin config: {e}")

    return cfg


def verify_credentials(username: str, password: str) -> bool:
    """Verify username/password against stored hash.

    Username must exactly match the configured one (used for basic auth).
    """
    try:
        cfg = load_or_create_config()
        username_hash = cfg["username_hash"]
        salt, stored_hash = password_hash_from_base64(username_hash)
        return verify_password_hash(salt, stored_hash, password)
    except Exception:
        return False


def parse_basic_auth(header: str) -> Optional[Tuple[str, str]]:
    """Parse HTTP Basic Auth header. Returns (username, password) or None."""
    import base64
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

    # Spec requirement: raise 503 if config cannot be loaded at all
    try:
        if not CONFIG_PATH.exists():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Admin config unavailable",
            )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin config unavailable",
        )

    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": 'Basic realm="toughening-admin"'},
        )

    parsed = parse_basic_auth(auth_header)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": 'Basic realm="toughening-admin"'},
        )

    username, password = parsed
    if not verify_credentials(username, password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": 'Basic realm="toughening-admin"'},
        )

    return {"username": username}


def is_loopback(request) -> bool:
    """Check if request origin is loopback (allow admin only locally)."""
    from fastapi.requests import Request
    client_host = request.client.host if request.client else None
    return client_host in ("127.0.0.1", "::1", "localhost")


def admin_log(action: str, detail: str = "", user: str = "admin"):
    """Append an audit log entry (one line, plain text).

    Format: "2026-10-09T14:23:45Z  user=admin  action=login  detail=ok"
    Never logs a password or hash.
    """
    from datetime import datetime
    ts = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    entry = f"{ts}  user={user}  action={action}  detail={detail}"
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(entry + "\n")
    except Exception:
        pass


def get_record_count(conn) -> int:
    """Return total number of records in the database."""
    row = conn.execute("SELECT COUNT(*) FROM records").fetchone()
    return int(row[0]) if row else 0


def get_status():
    """Return status dict: {db_path, db_size_bytes, record_count, record_types,
    backup_dir, backup_dir_available, last_backup, log_path, config_path}.

    Uses pc_db.open_db() read-only; never writes.
    """
    from pc import db as pc_db
    import os
    db_path = pc_db.DEFAULT_DB_PATH
    conn = pc_db.open_db(db_path)
    pc_db.init_db(conn)
    try:
        records_total = get_record_count(conn)
        try:
            rows = conn.execute("SELECT DISTINCT record_type FROM records").fetchall()
            record_types = [r[0] for r in rows if r[0]]
        except Exception:
            record_types = []
    finally:
        pc_db.close_db(conn)

    try:
        db_size = os.path.getsize(db_path) if os.path.exists(db_path) else 0
    except Exception:
        db_size = 0

    backup_dir = None
    last_backup = None
    try:
        import pc.config
        cfg = pc.config.load_config()
        backup_dir = cfg.get("backup_dir")
        if backup_dir and pc.backup.is_destination_available(backup_dir):
            import pc.backup
            files = pc.backup.list_backups(backup_dir) if hasattr(pc.backup, 'list_backups') else []
            if files:
                latest = max(files, key=lambda f: f.get("mtime", 0))
                last_backup = latest.get("path", "")
    except Exception:
        last_backup = None

    return {
        "db_path": db_path,
        "db_size_bytes": db_size,
        "record_count": records_total,
        "record_types": record_types,
        "backup_dir": backup_dir,
        "backup_dir_available": backup_dir is not None,
        "last_backup": last_backup,
        "log_path": str(LOG_PATH),
        "config_path": str(CONFIG_PATH),
    }


def get_backups():
    """List backups dict: {backup_dir, available, backups: [{name, size_bytes, mtime_ms}]

    If backup_dir unset: {backup_dir: None, available: False, backups: []}
    """
    import os
    backup_dir = None
    available = False
    backups = []

    try:
        import pc.config
        cfg = pc.config.load_config()
        backup_dir = cfg.get("backup_dir")
        if backup_dir and os.path.isdir(backup_dir):
            available = True
            import pc.backup
            for fname in sorted(os.listdir(backup_dir)):
                fpath = os.path.join(backup_dir, fname)
                try:
                    size = os.path.getsize(fpath)
                    mtime = os.path.getmtime(fpath)
                    backups.append({
                        "name": fname,
                        "size_bytes": size,
                        "mtime_ms": int(mtime * 1000),
                    })
                except Exception:
                    pass
    except Exception:
        backup_dir = None
        available = False
        backups = []

    return {
        "backup_dir": backup_dir,
        "available": available,
        "backups": backups,
    }


def trigger_backup():
    """Trigger a backup.

    If backup_dir unset -> raises ValueError("Backup destination not available").
    Otherwise calls pc.backup.make_backup(...). Returns {"path", "size_bytes"}.
    """
    import os
    from pc import db as pc_db
    import pc.backup

    backup_dir = None
    try:
        import pc.config
        cfg = pc.config.load_config()
        backup_dir = cfg.get("backup_dir")
    except Exception:
        backup_dir = None

    if not backup_dir or not pc.backup.is_destination_available(backup_dir):
        raise ValueError("backup not configured")

    db_path = pc_db.DEFAULT_DB_PATH
    try:
        result_path = pc.backup.make_backup(db_path, backup_dir)
        if result_path:
            size = os.path.getsize(result_path)
            return {"path": result_path, "size_bytes": size}
    except Exception as e:
        raise ValueError(f"Backup failed: {e}")

    return {"path": backup_dir, "size_bytes": 0}