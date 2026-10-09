// Admin panel JS (DR-50, Phase 2C-3i, PC-side only)
// No framework, no CDN, vanilla JS only.
// 4 functions: loadStatus, loadBackups, triggerBackup, logout
// Uses textContent only — no innerHTML.

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return 'unknown';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + units[i];
}

function formatDate(ms) {
  if (!ms) return 'unknown';
  const d = new Date(ms);
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function loadStatus() {
  fetch('/api/admin/status', { credentials: 'include' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      document.getElementById('st-db-path').textContent = data.db_path || 'unknown';
      document.getElementById('st-db-size').textContent = formatBytes(data.db_size_bytes);
      document.getElementById('st-record-count').textContent = String(data.record_count || 0);
      document.getElementById('st-record-types').textContent = (data.record_types || []).join(', ') || 'none';
      document.getElementById('st-backup-dir').textContent = data.backup_dir || 'not configured';
      document.getElementById('st-backup-available').textContent = data.backup_dir_available ? 'yes' : 'no';
      document.getElementById('st-last-backup').textContent = data.last_backup || 'none';
      document.getElementById('st-log-path').textContent = data.log_path || 'unknown';
      document.getElementById('st-config-path').textContent = data.config_path || 'unknown';
    })
    .catch(function(err) {
      document.getElementById('st-db-path').textContent = 'Error: ' + err.message;
    });
}

function loadBackups() {
  fetch('/api/admin/backups', { credentials: 'include' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var hint = document.getElementById('backup-hint');
      var tbody = document.querySelector('#tbl-backups tbody');
      var backups = data.backups || [];
      if (backups.length === 0) {
        hint.textContent = data.available ? 'No backups found.' : 'Backup directory not configured.';
        tbody.textContent = '';
      } else {
        hint.textContent = backups.length + ' backup(s) found.';
        tbody.textContent = '';
        backups.forEach(function(b) {
          var tr = document.createElement('tr');
          var td1 = document.createElement('td');
          td1.textContent = b.name;
          var td2 = document.createElement('td');
          td2.textContent = formatBytes(b.size_bytes);
          var td3 = document.createElement('td');
          td3.textContent = formatDate(b.mtime_ms);
          tr.appendChild(td1);
          tr.appendChild(td2);
          tr.appendChild(td3);
          tbody.appendChild(tr);
        });
      }
    })
    .catch(function(err) {
      document.getElementById('backup-hint').textContent = 'Error loading backups: ' + err.message;
    });
}

function triggerBackup() {
  fetch('/api/admin/backup', { method: 'POST', credentials: 'include' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      showToast('Backup triggered: ' + (data.path || 'unknown path'));
      loadBackups();
    })
    .catch(function(err) {
      showToast('Error: ' + err.message);
    });
}

function logout() {
  fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
    .then(function() {
      window.location.href = '/';
    })
    .catch(function(err) {
      showToast('Logout error: ' + err.message);
    });
}

function showToast(message) {
  var toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 3000);
}

document.addEventListener('DOMContentLoaded', function() {
  loadStatus();
  loadBackups();
  document.getElementById('btn-backup').addEventListener('click', triggerBackup);
  document.getElementById('btn-logout').addEventListener('click', logout);
});