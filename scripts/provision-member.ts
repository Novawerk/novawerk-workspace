#!/usr/bin/env tsx
// Provision a new member. Prints the SQL to run — it does NOT execute it, so you review before
// touching the live DB. Everyone is a Member; there are no titles. `can_admin` is a permission
// (approve outbox emails, edit content in the admin panel), not a rank.
//
// Usage: pnpm provision:member <id> "<Display Name>" <google-email> [--admin]

function main(): void {
  const args = process.argv.slice(2);
  const admin = args.includes("--admin");
  const [id, displayName, email] = args.filter((a) => a !== "--admin");

  if (!id || !/^[a-z][a-z0-9-]*$/.test(id) || !displayName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: pnpm provision:member <id> "<Display Name>" <google-email> [--admin]');
    console.error("  id: kebab handle, e.g. haodong. email: the Google account they sign in to the admin panel with.");
    process.exit(1);
  }

  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const today = new Date().toISOString().slice(0, 10);

  console.log(`# 1. Insert the member row (run against the app DB):`);
  console.log(
    `psql "$DATABASE_URL" -c "insert into members (id, display_name, email, can_admin, joined_on, active) ` +
      `values (${q(id)}, ${q(displayName)}, ${q(email)}, ${admin}, '${today}', true) on conflict (id) do nothing;"`,
  );
  console.log("");
  console.log(`# 2. Their private file prefix '${id}/...' and owner-scoped rows are enforced in code`);
  console.log(`#    (@nw/object-store assertMemberPrefix). No extra step.`);
  console.log("");
  console.log(`# 3. If they work on the agents or records, add them to the Novawerk GitHub org with access`);
  console.log(`#    to this repo. Repository secrets stay with the people who rotate them (see docs/runbook.md).`);
  console.log("");
  console.log(`# Remember to add them to records/people/roster.md.`);
}

main();
