/* ================================================================
   WealthFlow — js/drive.js
   Google Drive API + AES-256-GCM encrypt/decrypt + sync
   ================================================================ */
'use strict';

WF.Drive = (() => {

  const FILE_NAME = 'wealthflow_data.enc';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
  const CACHE_KEY = 'wf_data_cache';
  const SYNC_KEY  = 'wf_sync_meta';

  let _tokenClient = null;
  let _accessToken = null;
  let _fileId = null;
  let _syncStatus = 'idle'; // 'idle' | 'syncing' | 'error' | 'ok'
  let _lastSync = null;

  // ── Default data structure ──────────────────────────────────────
  function _defaultData() {
    return {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      accounts: [],
      portfolio: [],
      transactions: [],
      settings: {
        workerUrl: '',
        currency: 'EUR',
        autoRefresh: true,
        refreshInterval: 300,
      },
    };
  }

  // ── Load from localStorage (cache) ──────────────────────────────
  function loadFromCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : _defaultData();
    } catch {
      return _defaultData();
    }
  }

  function saveToCache(data) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  }

  // ── AES-256-GCM encryption ──────────────────────────────────────
  async function _deriveKey(passphrase) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(passphrase),
      { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: new TextEncoder().encode('WealthFlow2024!Salt'), iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false, ['encrypt', 'decrypt']
    );
  }

  async function _encrypt(data, passphrase) {
    const key = await _deriveKey(passphrase);
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder().encode(JSON.stringify(data));
    const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
    // Combine iv + ciphertext as base64
    const combined = new Uint8Array(iv.byteLength + ct.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ct), iv.byteLength);
    return btoa(String.fromCharCode(...combined));
  }

  async function _decrypt(b64, passphrase) {
    const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const key = await _deriveKey(passphrase);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(dec));
  }

  function _getPassphrase() {
    // Derive a passphrase from the auth state (pinHash + clientId)
    const authState = WF.Auth.getState();
    return (authState.pinHash || 'default') + '_wealthflow_2024';
  }

  // ── Google OAuth ────────────────────────────────────────────────
  async function initGoogle() {
    const clientId = WF.Auth.getGoogleClientId();
    if (!clientId) return false;
    if (!window.google?.accounts?.oauth2) return false;

    return new Promise(resolve => {
      _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error) { resolve(false); return; }
          _accessToken = resp.access_token;
          resolve(true);
        },
      });
      resolve(true);
    });
  }

  async function requestToken() {
    if (!_tokenClient) await initGoogle();
    if (!_tokenClient) return false;
    return new Promise(resolve => {
      _tokenClient.callback = (resp) => {
        if (resp.error) { resolve(false); return; }
        _accessToken = resp.access_token;
        resolve(true);
      };
      if (_accessToken) resolve(true);
      else _tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  function isConnected() { return !!_accessToken; }
  function getSyncStatus() { return _syncStatus; }
  function getLastSync() { return _lastSync; }

  // ── Drive API calls ─────────────────────────────────────────────
  async function _listAppDataFiles() {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)',
      { headers: { Authorization: `Bearer ${_accessToken}` } }
    );
    if (!res.ok) throw new Error(`Drive list error: ${res.status}`);
    const json = await res.json();
    return json.files || [];
  }

  async function _findFile() {
    const files = await _listAppDataFiles();
    return files.find(f => f.name === FILE_NAME) || null;
  }

  async function _downloadFile(fileId) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${_accessToken}` } }
    );
    if (!res.ok) throw new Error(`Drive download error: ${res.status}`);
    return res.text();
  }

  async function _uploadFile(content, fileId = null) {
    const metadata = { name: FILE_NAME, parents: fileId ? undefined : ['appDataFolder'] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([content], { type: 'text/plain' }));

    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&spaces=appDataFolder';

    const res = await fetch(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${_accessToken}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Drive upload error: ${res.status}`);
    return res.json();
  }

  // ── Load data from Drive ────────────────────────────────────────
  async function loadFromDrive() {
    if (!_accessToken) {
      const ok = await requestToken();
      if (!ok) return loadFromCache();
    }

    _setSyncStatus('syncing');
    try {
      const file = await _findFile();
      if (!file) {
        _setSyncStatus('ok');
        return loadFromCache(); // First time — no file yet
      }

      _fileId = file.id;
      const encrypted = await _downloadFile(file.id);
      const data = await _decrypt(encrypted, _getPassphrase());
      saveToCache(data);
      _lastSync = Date.now();
      _saveSyncMeta();
      _setSyncStatus('ok');
      return data;
    } catch (e) {
      console.error('Drive load error:', e);
      _setSyncStatus('error');
      return loadFromCache();
    }
  }

  // ── Save data to Drive ──────────────────────────────────────────
  async function saveToDrive(data) {
    data.updatedAt = new Date().toISOString();
    saveToCache(data);

    if (!_accessToken) {
      const ok = await requestToken();
      if (!ok) {
        WF.Utils.toast('Dati salvati in locale. Drive non connesso.', 'info');
        return false;
      }
    }

    _setSyncStatus('syncing');
    try {
      if (!_fileId) {
        const file = await _findFile();
        if (file) _fileId = file.id;
      }

      const encrypted = await _encrypt(data, _getPassphrase());
      const result = await _uploadFile(encrypted, _fileId || null);
      if (result.id) _fileId = result.id;

      _lastSync = Date.now();
      _saveSyncMeta();
      _setSyncStatus('ok');
      return true;
    } catch (e) {
      console.error('Drive save error:', e);
      _setSyncStatus('error');
      WF.Utils.toast('Errore sincronizzazione Drive', 'error');
      return false;
    }
  }

  // ── Sync status management ──────────────────────────────────────
  function _setSyncStatus(status) {
    _syncStatus = status;
    WF.Utils.Events.emit('sync:statusChanged', { status, lastSync: _lastSync });
    _updateSyncUI(status);
  }

  function _updateSyncUI(status) {
    const dots = document.querySelectorAll('.sync-dot');
    const texts = [
      document.getElementById('sidebar-sync-text'),
    ];
    dots.forEach(d => {
      d.className = 'sync-dot';
      if (status === 'syncing') d.classList.add('syncing');
      if (status === 'error')   d.classList.add('error');
    });
    const label = {
      idle:    'Non connesso',
      syncing: 'Sincronizzazione…',
      error:   'Errore sync',
      ok:      WF.Utils.timeAgo(_lastSync),
    }[status] || status;
    texts.forEach(t => { if (t) t.textContent = label; });
  }

  function _saveSyncMeta() {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ lastSync: _lastSync, fileId: _fileId }));
  }

  function _loadSyncMeta() {
    try {
      const raw = localStorage.getItem(SYNC_KEY);
      if (raw) {
        const meta = JSON.parse(raw);
        _lastSync = meta.lastSync;
        _fileId   = meta.fileId;
      }
    } catch {}
  }

  // ── Export/import backup ────────────────────────────────────────
  async function exportBackup(data) {
    const filename = `wealthflow_backup_${new Date().toISOString().split('T')[0]}.json`;
    WF.Utils.downloadJSON(data, filename);
  }

  async function importBackup(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.version || !data.accounts || !data.portfolio || !data.transactions) {
            reject(new Error('File di backup non valido'));
            return;
          }
          resolve(data);
        } catch { reject(new Error('JSON non valido')); }
      };
      reader.onerror = () => reject(new Error('Errore lettura file'));
      reader.readAsText(file);
    });
  }

  // ── Init ────────────────────────────────────────────────────────
  async function init() {
    _loadSyncMeta();
    await initGoogle();
  }

  // ── Public API ──────────────────────────────────────────────────
  return {
    init,
    loadFromCache,
    loadFromDrive,
    saveToDrive,
    saveToCache,
    isConnected,
    getSyncStatus,
    getLastSync,
    exportBackup,
    importBackup,
    requestToken,
  };

})();
