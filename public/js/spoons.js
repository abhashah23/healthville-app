// Crossing off spoons without reloading the page. Without this script the
// buttons still work: each tap saves and reloads.
(function () {
  'use strict';
  var form = document.querySelector('form[data-spoon-form]');
  if (!form || !window.fetch) return;
  var text = document.querySelector('[data-spoon-text]');
  var row = document.querySelector('[data-spoons]');
  var status = document.querySelector('[data-save-status]');
  var total = Number(text.getAttribute('data-total'));
  var csrf = form.querySelector('input[name="_csrf"]').value;

  function show(used) {
    var icons = row.querySelectorAll('.spoon');
    for (var i = 0; i < icons.length; i++) icons[i].classList.toggle('used', i >= total - used);
    text.innerHTML = '';
    var strong = document.createElement('strong');
    strong.textContent = used + ' of ' + total + ' spoons used.';
    text.appendChild(strong);
    text.appendChild(document.createTextNode(' ' + (total - used) + ' left.'));
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var change = e.submitter ? e.submitter.value : 'add';
    status.textContent = '';
    fetch(form.action, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ change: change })
    }).then(function (res) {
      if ((res.headers.get('content-type') || '').indexOf('json') === -1) throw new Error('signed out');
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body.error || 'Not saved');
        show(body.used);
      });
    }).catch(function (err) {
      status.classList.add('problem');
      status.textContent = err.message === 'signed out'
        ? 'You have been signed out. Sign in again to keep crossing off spoons.'
        : 'Not saved. Please check your connection and try again.';
    });
  });
})();
