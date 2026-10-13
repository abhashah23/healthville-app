'use strict';

// Applies any SQL files in migrations/ that have not been applied yet.
// Safe to run on every deploy.

const fs = require('fs');
const path = require('path');
const db = require('../src/db');

async function migrate() {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await db.many('SELECT name FROM schema_migrations')).map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.transaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log(`Applied ${file}`);
  }
}

module.exports = migrate;

if (require.main === module) {
  migrate()
    .then(() => db.pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
