// NB-ADR-0014: migrations 0017–0021 merge contributors into members. This runs the migrations
// before them, writes members and contributors the old way, runs the rest and checks the result.

import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
const FIRST_MERGE_MIGRATION = 17;

const ADA = "11111111-1111-4111-8111-111111111111"; // signs in by email, same address as member `ada`
const BEN = "22222222-2222-4222-8222-222222222222"; // GitHub only; GitHub's email is member `ben`'s
const CY = "33333333-3333-4333-8333-333333333333"; // nobody else's address
const DEE = "44444444-4444-4444-8444-444444444444"; // handle `eve`, which member `eve` would take

let pg: PGlite;

async function run(from: number, to: number): Promise<void> {
  const files = (await readdir(migrationsFolder)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const n = Number(file.slice(0, 4));
    if (n < from || n > to) continue;
    const text = await readFile(join(migrationsFolder, file), "utf8");
    for (const statement of text.split("--> statement-breakpoint")) {
      if (statement.trim()) await pg.exec(statement);
    }
  }
}

beforeAll(async () => {
  pg = new PGlite();
  await run(0, FIRST_MERGE_MIGRATION - 1);
  await pg.exec(`
    insert into members (id, display_name, email, can_admin) values
      ('ada', 'Ada', 'Ada@Example.com', true),
      ('ben', 'Ben', 'ben@example.com', false),
      ('eve', 'Eve', 'eve@example.com', false);
    update members set public_profile = true, profile_handle = 'ben-b', profile_bio = 'Member bio'
      where id = 'ben';
    insert into contributors (id, handle, display_name, email, github_id, github_login, notify_email, bio, public) values
      ('${ADA}', 'ada-c', 'Ada C', 'ada@example.com', null, null, null, 'Contributor bio', true),
      ('${BEN}', 'benb', 'Ben B', null, 42, 'benb', 'BEN@example.com', 'Contributor bio', false),
      ('${CY}', 'cy', 'Cy', null, 43, 'cy', 'cy@example.com', null, true),
      ('${DEE}', 'eve', 'Dee', 'dee@example.com', null, null, null, null, false);
    insert into tasks (title, assignee_id, suggested_by) values ('One', '${ADA}', '${CY}');
    insert into task_votes (task_id, contributor_id) values (1, '${BEN}'), (1, '${CY}');
    insert into werk_ledger (contributor_id, delta, reason) values ('${BEN}', 3, 'merged');
  `);
  await run(FIRST_MERGE_MIGRATION, 9999);
}, 60_000);

async function rows<T>(query: string): Promise<T[]> {
  return (await pg.query<T>(query)).rows;
}

describe("merging contributors into members (NB-ADR-0014)", () => {
  it("gives maintainer to the members who could admin, member to everyone else", async () => {
    const all = await rows<{ id: string; role: string }>(`select id, role from members order by id`);
    expect(all.find((m) => m.id === "ada")?.role).toBe("maintainer");
    expect(all.filter((m) => m.role === "maintainer")).toHaveLength(1);
  });

  it("makes one account per verified address", async () => {
    const all = await rows<{ id: string }>(`select id from members order by id`);
    expect(all.map((m) => m.id).sort()).toEqual(["ada", "ben", CY, DEE, "eve"].sort());
  });

  it("merges on the sign-in email, lower-cased", async () => {
    const [ada] = await rows<Record<string, unknown>>(`select * from members where id = 'ada'`);
    expect(ada).toMatchObject({ email: "ada@example.com", profile_handle: "ada-c", profile_bio: "Contributor bio", public_profile: true });
  });

  it("merges on GitHub's verified email, keeping what the member had", async () => {
    const [ben] = await rows<Record<string, unknown>>(`select * from members where id = 'ben'`);
    expect(ben).toMatchObject({
      github_id: 42,
      github_login: "benb",
      profile_handle: "ben-b",
      profile_bio: "Member bio",
      public_profile: true,
    });
  });

  it("keeps a contributor without a match as a member with the same id", async () => {
    const [cy] = await rows<Record<string, unknown>>(`select * from members where id = '${CY}'`);
    expect(cy).toMatchObject({ profile_handle: "cy", email: null, notify_email: "cy@example.com", role: "member" });
  });

  it("gives every member a handle, numbered when taken", async () => {
    const [eve] = await rows<{ profile_handle: string }>(`select profile_handle from members where id = 'eve'`);
    expect(eve!.profile_handle).toBe("eve-2");
  });

  it("moves the merged contributors' rows onto their member", async () => {
    const [task] = await rows<{ assignee_id: string; suggested_by: string }>(`select assignee_id, suggested_by from tasks`);
    expect(task).toEqual({ assignee_id: "ada", suggested_by: CY });
    const votes = await rows<{ contributor_id: string }>(`select contributor_id from task_votes order by contributor_id`);
    expect(votes.map((v) => v.contributor_id).sort()).toEqual(["ben", CY].sort());
    const werk = await rows<{ contributor_id: string }>(`select contributor_id from werk_ledger`);
    expect(werk).toEqual([{ contributor_id: "ben" }]);
  });

  it("leaves no contributors table, placeholders or merge table", async () => {
    const tables = await rows<{ table_name: string }>(
      `select table_name from information_schema.tables where table_name in ('contributors', '_account_merge')`,
    );
    expect(tables).toEqual([]);
    const placeholders = await rows(`select id from members where profile_handle like '\\_merged-%'`);
    expect(placeholders).toEqual([]);
  });
});
