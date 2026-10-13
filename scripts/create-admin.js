'use strict';

// Creates the first admin account so someone can sign in and add everyone
// else through the Admin pages.
//   npm run create-admin -- "Abha Shah" abha@example.org

const db = require('../src/db');
const migrate = require('./migrate');

async function main() {
  const [name, email] = process.argv.slice(2);
  if (!name || !email) {
    console.error('Usage: npm run create-admin -- "Full Name" email@example.org');
    process.exit(1);
  }
  await migrate();
  const row = await db.one(
    `INSERT INTO users (name, email, role) VALUES ($1, lower($2), 'admin')
     ON CONFLICT ((lower(email))) DO UPDATE SET role = 'admin', active = true, participant_code = NULL, group_id = NULL
     RETURNING id, name, email`,
    [name, email]
  );
  console.log(`Admin ready: ${row.name} <${row.email}>`);
  await db.pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
