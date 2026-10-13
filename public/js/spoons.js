// Spoon Tracker: shows the person's own "today" and crosses off spoons
// without reloading. Without this script each tap saves and reloads.
(function () {
  'use strict';
  var form = document.querySelector('form[data-spoon-form]');
  if (!form) return;

  // Use the person's own date, if it falls in the days the tracker is open.
  var d = new Date();
  var local = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  var allowed = (form.getAttribute('data-dates') || '').split(',');
  if (local !== form.getAttribute('data-date') && allowed.indexOf(local) !== -1 && location.search.indexOf('date=') === -1) {
    location.replace('/tracker/spoons?date=' + local);
    return;
  }
  if (!window.fetch) return;

  var csrf = form.querySelector('input[name="_csrf"]').value;
  var date = form.querySelector('input[name="date"]').value;
  var text = form.querySelector('[data-spoon-text]');
  var total = form.querySelectorAll('.spoon-btn').length;

  function show(mask) {
    var n = 0;
    form.querySelectorAll('.spoon-btn').forEach(function (b) {
      var off = Boolean(mask & (1 << Number(b.value)));
      if (off) n++;
      b.setAttribute('aria-pressed', String(off));
      b.querySelector('.spoon').classList.toggle('used', off);
    });
    text.textContent = n + ' crossed off, ' + (total - n) + ' left.';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!e.submitter) return;
    fetch(form.action, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ spoon: Number(e.submitter.value), date: date })
    }).then(function (res) {
      if ((res.headers.get('content-type') || '').indexOf('json') === -1) throw new Error('signed out');
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body.error || 'Not saved');
        show(body.crossed);
      });
    }).catch(function (err) {
      text.textContent = err.message === 'signed out'
        ? 'You have been signed out. Sign in again to cross off spoons.'
        : 'Not saved. Please check your connection and try again.';
    });
  });
})();
