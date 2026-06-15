/* ================================================================
   WealthFlow — js/auth.js
   Autenticazione: PIN 6 cifre, SHA-256, WebAuthn biometria, auto-lock
   ================================================================ */
'use strict';

WF.Auth = (() => {

  const STORAGE_KEY = 'wf_auth';
  const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minuti

  let _state = null;
  let _currentPin = '';
  let _setupPin = '';
  let _setupPhase = 'create'; // 'create' | 'confirm'
  let _lockTimer = null;
  let _authenticated = false;

  // ── Load/save state ─────────────────────────────────────────────
  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _state = raw ? JSON.parse(raw) : _defaultState();
    } catch (e) {
      _state = _defaultState();
    }
    return _state;
  }

  function _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
  }

  function _defaultState() {
    return {
      pinHash: null,
      biometricEnabled: false,
      biometricCredentialId: null,
      googleClientId: '',
      googleDriveFileId: null,
      setupComplete: false,
      userName: 'Portafoglio',
    };
  }

  function getState() { return { ..._state }; }
  function isSetupComplete() { return !!_state?.setupComplete; }
  function isAuthenticated() { return _authenticated; }

  // ── PIN setup (first run) ───────────────────────────────────────
  function initSetupUI() {
    const setupSection = document.getElementById('pin-setup');
    const pinSection   = document.getElementById('pin-section');
    const { show, hide } = WF.Utils;

    show(setupSection);
    hide(pinSection);

    _setupPin = '';
    _setupPhase = 'create';
    _updateSetupDisplay();

    // Keypad buttons
    document.querySelectorAll('[data-setup-digit]').forEach(btn => {
      btn.addEventListener('click', () => _onSetupDigit(btn.dataset.setupDigit));
    });
    document.getElementById('pin-setup-del')?.addEventListener('click', _onSetupDelete);
  }

  function _onSetupDigit(digit) {
    if (_setupPin.length >= 6) return;
    _setupPin += digit;
    _updateSetupDisplay();
    if (_setupPin.length === 6) setTimeout(_onSetupComplete, 200);
  }

  function _onSetupDelete() {
    _setupPin = _setupPin.slice(0, -1);
    _updateSetupDisplay();
  }

  function _updateSetupDisplay() {
    const dots  = document.querySelectorAll('#pin-setup-display .pin-dot');
    const label = document.getElementById('pin-setup-label');
    dots.forEach((d, i) => d.classList.toggle('filled', i < _setupPin.length));
    if (label) {
      label.textContent = _setupPhase === 'create'
        ? 'Scegli un PIN a 6 cifre'
        : 'Conferma il PIN scelto';
    }
  }

  async function _onSetupComplete() {
    if (_setupPhase === 'create') {
      _setupPhase = 'confirm';
      const firstPin = _setupPin;
      _setupPin = '';
      _updateSetupDisplay();
      // Store first PIN temporarily
      _state._tempPin = firstPin;
    } else {
      // Confirm phase
      if (_setupPin !== _state._tempPin) {
        _pinError('#pin-setup-display');
        WF.Utils.toast('I PIN non corrispondono. Riprova.', 'error');
        _setupPhase = 'create';
        _setupPin = '';
        delete _state._tempPin;
        _updateSetupDisplay();
        return;
      }
      // PINs match — save hash
      _state.pinHash = await WF.Utils.sha256(_setupPin);
      delete _state._tempPin;
      _state.setupComplete = true;
      _save();

      // Offer biometrics if available
      if (await _isBiometricAvailable()) {
        await _registerBiometric();
      }

      WF.Utils.toast('PIN impostato con successo!', 'success');
      _authenticated = true;
      _startAutoLock();
      WF.Utils.Events.emit('auth:success');
    }
  }

  // ── PIN unlock ──────────────────────────────────────────────────
  function initLockUI() {
    const { show, hide } = WF.Utils;

    // Decide which section to show
    if (!_state.setupComplete) {
      initSetupUI();
      return;
    }

    // Show pin section, hide setup
    show(document.getElementById('pin-section'));
    hide(document.getElementById('pin-setup'));

    // Show Google sign-in if client ID is set and Drive not yet connected
    if (_state.googleClientId) {
      const gWrap = document.getElementById('google-signin-wrap');
      if (gWrap) {
        show(gWrap);
        // Update Google GSI client_id
        const gLoad = document.getElementById('g_id_onload');
        if (gLoad) gLoad.dataset.clientId = _state.googleClientId;
      }
    }

    _currentPin = '';
    _updatePinDisplay();

    // Keypad buttons
    document.querySelectorAll('[data-digit]').forEach(btn => {
      btn.addEventListener('click', () => _onPinDigit(btn.dataset.digit));
    });
    document.getElementById('pin-del')?.addEventListener('click', _onPinDelete);
    document.getElementById('bio-btn')?.addEventListener('click', _tryBiometric);

    // Show/hide biometric button
    const bioBtn = document.getElementById('bio-btn');
    if (bioBtn) {
      bioBtn.style.display = _state.biometricEnabled ? 'flex' : 'none';
    }
    const emptyKey = document.querySelector('.pin-key--empty');
    if (emptyKey) {
      emptyKey.style.display = _state.biometricEnabled ? 'none' : 'flex';
    }

    // Auto-try biometric on load
    if (_state.biometricEnabled) {
      setTimeout(_tryBiometric, 600);
    }
  }

  function _onPinDigit(digit) {
    if (_currentPin.length >= 6) return;
    _currentPin += digit;
    _updatePinDisplay();
    if (_currentPin.length === 6) setTimeout(_verifyPin, 120);
  }

  function _onPinDelete() {
    _currentPin = _currentPin.slice(0, -1);
    _updatePinDisplay();
  }

  function _updatePinDisplay() {
    const dots  = document.querySelectorAll('#pin-display .pin-dot');
    const label = document.getElementById('pin-label');
    dots.forEach((d, i) => d.classList.toggle('filled', i < _currentPin.length));
    if (label) label.textContent = 'Inserisci il PIN';
  }

  async function _verifyPin() {
    const hash = await WF.Utils.sha256(_currentPin);
    if (hash === _state.pinHash) {
      _authenticated = true;
      _currentPin = '';
      _startAutoLock();
      WF.Utils.Events.emit('auth:success');
    } else {
      _pinError('#pin-display');
      document.getElementById('pin-label').textContent = 'PIN errato. Riprova.';
      _currentPin = '';
      setTimeout(_updatePinDisplay, 700);
    }
  }

  function _pinError(selector) {
    const dots = document.querySelectorAll(`${selector} .pin-dot`);
    dots.forEach(d => {
      d.classList.add('error');
      setTimeout(() => d.classList.remove('error'), 500);
    });
  }

  // ── PIN change ──────────────────────────────────────────────────
  async function changePin(oldPin, newPin, confirmPin) {
    if (newPin !== confirmPin) throw new Error('I PIN non corrispondono');
    if (newPin.length !== 6) throw new Error('Il PIN deve essere di 6 cifre');

    const oldHash = await WF.Utils.sha256(oldPin);
    if (oldHash !== _state.pinHash) throw new Error('PIN attuale errato');

    _state.pinHash = await WF.Utils.sha256(newPin);
    _save();
    WF.Utils.toast('PIN modificato con successo', 'success');
  }

  // ── Biometric (WebAuthn) ────────────────────────────────────────
  async function _isBiometricAvailable() {
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch { return false; }
  }

  async function _registerBiometric() {
    try {
      const userId = new Uint8Array(16);
      crypto.getRandomValues(userId);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'WealthFlow', id: location.hostname },
          user: { id: userId, name: 'owner', displayName: 'Portafoglio' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          timeout: 60000,
        }
      });

      if (credential) {
        _state.biometricEnabled = true;
        _state.biometricCredentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        _save();
        WF.Utils.toast('Biometria attivata!', 'success');
        return true;
      }
    } catch (e) {
      console.log('Biometric registration skipped:', e.message);
    }
    return false;
  }

  async function enableBiometric() {
    if (!_authenticated) throw new Error('Non autenticato');
    const available = await _isBiometricAvailable();
    if (!available) throw new Error('Biometria non disponibile su questo dispositivo');
    return _registerBiometric();
  }

  async function disableBiometric() {
    _state.biometricEnabled = false;
    _state.biometricCredentialId = null;
    _save();
    WF.Utils.toast('Biometria disattivata', 'info');
  }

  async function _tryBiometric() {
    if (!_state.biometricEnabled || !_state.biometricCredentialId) return;
    try {
      const rawId = Uint8Array.from(atob(_state.biometricCredentialId), c => c.charCodeAt(0));
      await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: rawId }],
          userVerification: 'required',
          timeout: 30000,
        }
      });
      _authenticated = true;
      _startAutoLock();
      WF.Utils.Events.emit('auth:success');
    } catch (e) {
      if (e.name !== 'NotAllowedError') {
        console.log('Biometric failed:', e.message);
      }
    }
  }

  // ── Auto-lock ───────────────────────────────────────────────────
  function _startAutoLock() {
    _resetLockTimer();
    document.addEventListener('touchstart', _resetLockTimer, { passive: true });
    document.addEventListener('click', _resetLockTimer);
    document.addEventListener('keydown', _resetLockTimer);
  }

  function _resetLockTimer() {
    clearTimeout(_lockTimer);
    _lockTimer = setTimeout(_lock, AUTO_LOCK_MS);
  }

  function _lock() {
    _authenticated = false;
    _currentPin = '';
    WF.Utils.Events.emit('auth:locked');
  }

  function manualLock() { _lock(); }

  // ── Google OAuth / Client ID ────────────────────────────────────
  function getGoogleClientId() { return _state.googleClientId || ''; }

  function setGoogleClientId(clientId) {
    _state.googleClientId = clientId;
    _save();
  }

  function setUserName(name) {
    _state.userName = name;
    _save();
    WF.Utils.Events.emit('auth:userUpdated');
  }

  function getUserName() { return _state.userName || 'Portafoglio'; }

  // ── Biometric state getters ─────────────────────────────────────
  function isBiometricEnabled() { return !!_state.biometricEnabled; }

  // ── Init ────────────────────────────────────────────────────────
  function init() {
    _load();
  }

  // ── Public API ──────────────────────────────────────────────────
  return {
    init,
    initLockUI,
    isSetupComplete,
    isAuthenticated,
    changePin,
    enableBiometric,
    disableBiometric,
    isBiometricEnabled,
    manualLock,
    getState,
    getGoogleClientId,
    setGoogleClientId,
    setUserName,
    getUserName,
  };

})();
