'use strict';

const db = require('./db');

function labelFor(user) {
  if (!user) return 'system';
  return `${user.name} (${user.role})`;
}

// Records who did what. For participant subjects, the label is the
// participant code, so the entry still makes sense after a deletion.
async function record(actor, action, { subject = null, groupId = null, details = null } = {}) {
  await db.query(
    `INSERT INTO audit_log (actor_id, actor_label, action, subject_user_id, subject_label, group_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      actor ? actor.id : null,
      labelFor(actor),
      action,
      subject ? subject.id : null,
      subject ? subject.participant_code || subject.name : null,
      groupId,
      details,
    ]
  );
}

module.exports = { record };
