#!/usr/bin/env node
// Apply broadcasting migration to Supabase via Management API
// Usage: SUPABASE_ACCESS_TOKEN=your_token node apply-broadcast-migration.js
// Get token from: https://supabase.com/dashboard/account/tokens

const fs = require('fs');
const path = require('path');
const PROJECT_REF = 'oqboitkpcvuaudouwvkl';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!TOKEN) {
  console.error('Set SUPABASE_ACCESS_TOKEN env var first');
  console.error('Get it from: https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const sql = fs.readFileSync(
  path.join(__dirname, 'supabase', 'migrations', '20260601000000_broadcasting.sql'),
  'utf8'
);

async function main() {
  const url = 'https://api.supabase.com/v1/projects/' + PROJECT_REF + '/database/query';
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });
  console.log('Status:', r.status);
  const body = await r.text();
  console.log(body);
  if (!r.ok) process.exit(1);
  else console.log('Migration applied successfully!');
}
main();
