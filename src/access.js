'use strict';

// Who can see which group. Admins see every group. Facilitators see only the
// groups they are assigned to.

const db = require('./db');

async function visibleGroups(user) {
  if (user.role === 'admin') return db.many('SELECT * FROM groups ORDER BY session1_date DESC, name');
  if (user.role === 'facilitator') {
    return db.many(
      `SELECT g.* FROM groups g JOIN group_facilitators gf ON gf.group_id = g.id
       WHERE gf.user_id = $1 ORDER BY g.session1_date DESC, g.name`,
      [user.id]
    );
  }
  return [];
}

async function canSeeGroup(user, groupId) {
  if (user.role === 'admin') return true;
  if (user.role !== 'facilitator') return false;
  const row = await db.one('SELECT 1 FROM group_facilitators WHERE group_id = $1 AND user_id = $2', [groupId, user.id]);
  return Boolean(row);
}

module.exports = { visibleGroups, canSeeGroup };
