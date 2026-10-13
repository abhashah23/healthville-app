// Adds the person's own local time next to times shown in Eastern Time,
// for participants outside Eastern Time.
(function () {
  'use strict';
  if (!window.Intl || !Intl.DateTimeFormat) return;
  var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!zone || zone === 'America/Toronto' || zone === 'America/New_York') return;
  document.querySelectorAll('time[data-local-time]').forEach(function (el) {
    var when = new Date(el.getAttribute('datetime'));
    if (isNaN(when)) return;
    var local = when.toLocaleString('en-CA', {
      weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    var span = document.createElement('span');
    span.textContent = ' (' + local + ' your time)';
    el.after(span);
  });
})();
