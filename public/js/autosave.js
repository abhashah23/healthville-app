// Saves tracker answers as the person types or taps, so nothing is lost.
// If a save fails (no signal, signed out), the answer is kept on this device
// and saved again later. The page also works without this script: the
// buttons at the bottom save the normal way.
(function () {
  'use strict';

  var form = document.querySelector('form[data-autosave]');
  if (!form || !window.fetch) return;

  var statusEl = form.querySelector('[data-save-status]');
  var csrf = form.querySelector('input[name="_csrf"]').value;
  var draftKey = form.getAttribute('data-draft-key');
  var timer = null;
  var retryTimer = null;
  var retryDelay = 4000;
  var lastSaved = null;
  var saving = false;
  var again = false;

  function values() {
    var data = {};
    var fd = new FormData(form);
    fd.forEach(function (v, k) {
      if (k !== '_csrf' && k !== 'go') data[k] = v;
    });
    if (form.querySelector('input[name="score"]') && !('score' in data)) data.score = '';
    return data;
  }

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function storeDraft(data) {
    try { localStorage.setItem(draftKey, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  }
  function readDraft() {
    try { return JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch (e) { return null; }
  }
  function clearDraft() {
    try { localStorage.removeItem(draftKey); } catch (e) { /* storage unavailable */ }
  }

  function show(text, problem) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('problem', Boolean(problem));
  }

  function save(keepalive) {
    var data = values();
    if (same(data, lastSaved)) return;
    if (saving) { again = true; return; }
    saving = true;
    storeDraft(data);
    show('Saving...');
    fetch(form.action, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: Boolean(keepalive),
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(data)
    }).then(function (res) {
      var type = res.headers.get('content-type') || '';
      if (res.type === 'opaqueredirect' || type.indexOf('json') === -1) {
        throw { signedOut: true };
      }
      return res.json().then(function (body) {
        if (!res.ok) throw { message: body.error };
        lastSaved = data;
        clearDraft();
        retryDelay = 4000;
        show('Saved');
      });
    }).catch(function (err) {
      if (err && err.message) {
        show(err.message, true);
        return;
      }
      if (err && err.signedOut) {
        show('You have been signed out. Your answer is kept on this device. Sign in again and come back to this page to save it.', true);
        return;
      }
      show('Not saved yet. No connection. Your answer is kept on this device and we will keep trying.', true);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(function () { save(); }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60000);
    }).then(function () {
      saving = false;
      if (again) { again = false; save(); }
    });
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(function () { save(); }, delay);
  }

  lastSaved = values();

  // Bring back an answer that was not saved last time.
  var draft = readDraft();
  if (draft && !same(draft, lastSaved)) {
    Object.keys(draft).forEach(function (k) {
      var fields = form.querySelectorAll('[name="' + k + '"]');
      fields.forEach(function (f) {
        if (f.type === 'radio') f.checked = f.value === draft[k];
        else f.value = draft[k];
      });
    });
    show('We found an answer that had not been saved yet and put it back.');
    save();
  } else if (draft) {
    clearDraft();
  }

  form.addEventListener('change', function (e) {
    schedule(e.target.type === 'radio' ? 0 : 400);
  });
  form.addEventListener('input', function (e) {
    if (e.target.type !== 'radio') schedule(1200);
  });
  form.addEventListener('submit', function () {
    storeDraft(values());
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') save(true);
  });
})();
