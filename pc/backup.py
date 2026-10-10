import datetime
import glob
import logging
import os
import sqlite3
import tempfile
import threading
import time

log = logging.getLogger("pc.backup")

BACKUP_PREFIX = "backup_"
BACKUP_SUFFIX = ".sqlite"
BACKUP_TIMESTAMP_FORMAT = "%Y%m%d_%H%M%S"
DEFAULT_RETENTION = 30
SCHEDULER_JOIN_TIMEOUT = 2
SECONDS_PER_DAY = 86400


def is_destination_available(backup_dir):
    if not backup_dir:
        return False
    if not os.path.isdir(backup_dir):
        return False
    return os.access(backup_dir, os.W_OK)


def _filename_timestamp(filename):
    if not (filename.startswith(BACKUP_PREFIX) and filename.endswith(BACKUP_SUFFIX)):
        return None
    try:
        stamp = filename[len(BACKUP_PREFIX):-len(BACKUP_SUFFIX)]
        return datetime.datetime.strptime(stamp, BACKUP_TIMESTAMP_FORMAT)
    except ValueError:
        return None


def _backup_path_for(backup_dir, now):
    return os.path.join(
        backup_dir,
        BACKUP_PREFIX + now.strftime(BACKUP_TIMESTAMP_FORMAT) + BACKUP_SUFFIX,
    )


def _list_backups(backup_dir):
    pattern = os.path.join(backup_dir, BACKUP_PREFIX + "*" + BACKUP_SUFFIX)
    return sorted(glob.glob(pattern))


def _needs_catchup(backup_dir):
    backups = _list_backups(backup_dir)
    if not backups:
        return True
    newest = os.path.basename(backups[-1])
    newest_ts = _filename_timestamp(newest)
    if newest_ts is None:
        return True
    now = datetime.datetime.now()
    return (now - newest_ts) >= datetime.timedelta(hours=24)


def make_backup(db_path, backup_dir):
    if not db_path:
        log.info("backup skipped: source DB path is empty")
        return None
    if not os.path.exists(db_path):
        log.info("backup skipped: source DB does not exist: %s", db_path)
        return None
    if not is_destination_available(backup_dir):
        log.info("backup skipped: destination unavailable: %s", backup_dir)
        return None

    now = datetime.datetime.now()
    final_path = _backup_path_for(backup_dir, now)
    # The temp name must NOT match backup_*.sqlite, otherwise a crash leaves
    # a half-written file that is listed and counted by retention.
    fd, tmp_path = tempfile.mkstemp(
        suffix=".tmp", prefix=".partial_", dir=backup_dir
    )
    try:
        os.close(fd)
        src = sqlite3.connect(db_path)
        try:
            try:
                # sqlite3.Connection.backup() takes a Connection as its
                # target, not a path — open the destination explicitly.
                dst = sqlite3.connect(tmp_path)
                try:
                    src.backup(dst)
                finally:
                    dst.close()
            except (AttributeError, sqlite3.OperationalError):
                log.info("backup: sqlite3.Connection.backup unavailable, "
                         "falling back to VACUUM INTO")
                src.execute("VACUUM INTO ?", (tmp_path,))
        finally:
            src.close()
        os.replace(tmp_path, final_path)
        log.info("backup created: %s", final_path)
        return final_path
    except Exception as exc:
        log.error("backup failed: %s", exc)
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        return None


def enforce_retention(backup_dir, keep=DEFAULT_RETENTION):
    backups = _list_backups(backup_dir)
    if len(backups) <= keep:
        return 0
    to_delete = backups[:-keep]
    deleted = 0
    for path in to_delete:
        try:
            os.unlink(path)
            deleted += 1
        except OSError as exc:
            log.warning("retention: could not delete %s: %s", path, exc)
    return deleted


def backup_now(db_path, backup_dir, retention=DEFAULT_RETENTION):
    result = {
        "attempted": True,
        "succeeded": False,
        "backup_path": None,
        "deleted_count": 0,
        "reason": None,
    }
    if not is_destination_available(backup_dir):
        result["reason"] = "destination unavailable: %s" % backup_dir
        return result
    backup_path = make_backup(db_path, backup_dir)
    if backup_path is None:
        result["reason"] = "make_backup failed"
        return result
    result["backup_path"] = backup_path
    result["succeeded"] = True
    result["deleted_count"] = enforce_retention(backup_dir, retention)
    return result


def _seconds_until_next_occurrence(hour):
    now = datetime.datetime.now()
    next_run = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if next_run <= now:
        next_run = next_run + datetime.timedelta(days=1)
    return (next_run - now).total_seconds()


def _scheduler_loop(db_path, backup_dir, hour, retention, stop_event):
    try:
        hour = int(hour)
    except (TypeError, ValueError):
        hour = 2
    if not 0 <= hour <= 23:
        log.warning("backup_hour %r out of range 0-23; using 2", hour)
        hour = 2
    try:
        retention = max(1, int(retention))
    except (TypeError, ValueError):
        retention = DEFAULT_RETENTION
    if _needs_catchup(backup_dir):
        if stop_event.is_set():
            return
        result = backup_now(db_path, backup_dir, retention)
        log.info("startup catch-up backup: %s", result)

    while not stop_event.is_set():
        delay = _seconds_until_next_occurrence(hour)
        if stop_event.wait(delay):
            break
        if stop_event.is_set():
            break
        result = backup_now(db_path, backup_dir, retention)
        log.info("scheduled backup: %s", result)
        # BUG FIX: the loop used to wait a full day here AND then wait for the
        # next occurrence of `hour`, i.e. one backup every 48 h. A short pause
        # is enough to step past the current hour boundary.
        if stop_event.wait(60):
            break


def start_scheduler(db_path, backup_dir, hour, retention, stop_event):
    thread = threading.Thread(
        target=_scheduler_loop,
        args=(db_path, backup_dir, hour, retention, stop_event),
        daemon=True,
        name="backup-scheduler",
    )
    thread.start()
    return thread