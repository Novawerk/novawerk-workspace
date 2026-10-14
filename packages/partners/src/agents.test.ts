// Discovery and outreach end to end against real migrations (PGlite), a stubbed Claude and an
// in-memory record store. The point: both only write rows/records and queue — never send.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { stubClaude } from "@nw/agent-core";
import { Db, outbox, partners, type Database } from "@nw/db";
import { createTestDb, resetDb } from "@nw/db/testing";
import { memoryRecordStore } from "@nw/records";

import { appendHistory, discoverSponsors, draftOutreach, normalizeProposed } from "./agents.js";

const log = () => {};
let db: Database;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

beforeEach(async () => {
  await resetDb(db);
});

describe("normalizeProposed", () => {
  it("drops blank entries, keeps only plausible emails, caps the count", () => {
    const out = normalizeProposed(
      {
        candidates: [
          { name: " Acme ", whyFit: "funds education", suggestedContact: "grants@acme.org", source: "" },
          { name: "Globex", whyFit: "backs makers", suggestedContact: "ask on their site", source: "https://globex.example" },
          { name: "", whyFit: "nameless", suggestedContact: "", source: "" },
          { name: "Initech", whyFit: "x", suggestedContact: "", source: "" },
        ],
      },
      2,
    );
    expect(out).toEqual([
      { name: "Acme", whyFit: "funds education", suggestedContact: "grants@acme.org", source: undefined },
      { name: "Globex", whyFit: "backs makers", suggestedContact: undefined, source: "https://globex.example" },
    ]);
  });
});

describe("discoverSponsors", () => {
  it("creates intro partners + records for new candidates only, and queues nothing", async () => {
    await new Db(db).insertPartner({ id: "acme-foundation", name: "Acme Foundation" });
    const claude = stubClaude(() => ({
      candidates: [
        { name: "Acme Foundation", whyFit: "already have", suggestedContact: "", source: "" },
        { name: "Bright Sparks Trust", whyFit: "backs STEM workshops", suggestedContact: "hello@brightsparks.org", source: "" },
      ],
    }));
    const records = memoryRecordStore();
    const result = await discoverSponsors({ db, claude, records, log }, { criteria: "x", max: 8, today: "2026-10-03" });

    expect(result).toMatchObject({ proposed: 2, created: ["bright-sparks-trust"], recordsWritten: ["records/partners/bright-sparks-trust.md"] });
    expect(await new Db(db).getPartner("bright-sparks-trust")).toMatchObject({ stage: "intro", primaryEmail: "hello@brightsparks.org" });
    expect(records.files.get("records/partners/bright-sparks-trust.md")).toContain("unverified");
    expect(await db.select().from(outbox)).toEqual([]);
  });
});

describe("draftOutreach", () => {
  const claude = stubClaude(() => ({ subject: "Novawerk  ×\nAcme", body: "Hi Jane,\n\nWe build things.\n\nNovawerk" }));
  const record = `---
title: Acme
category: partners
status: draft
confidential: true
source: []
related: []
updated: 2026-06-04
---

# Acme

## History

- _2026-06-04_ — record created.

## Notes for outreach

- Keep it short.
`;

  beforeEach(async () => {
    await db.insert(partners).values({ id: "acme", name: "Acme", primaryEmail: "jane@acme.org", primaryContact: "Jane" });
  });

  it("queues a pending outbox row and notes it in the partner record", async () => {
    const records = memoryRecordStore({ "records/partners/acme.md": record });
    const result = await draftOutreach({ db, claude, records, log }, { partnerId: "acme", intent: "intro" }, { voice: "Short.", today: "2026-10-03" });

    const [row] = await db.select().from(outbox);
    expect(row).toMatchObject({
      id: result.outboxId,
      status: "pending",
      to: "jane@acme.org",
      subject: "Novawerk × Acme",
      draftedBy: "sponsor-outreach",
      relatedTable: "partners",
      relatedId: "acme",
    });
    const updated = records.files.get("records/partners/acme.md")!;
    expect(updated).toContain(`- _2026-10-03_ — intro draft queued in the outbox (\`${result.outboxId}\`)`);
    // The new line lands inside History, before the next section.
    expect(updated.indexOf("intro draft queued")).toBeLessThan(updated.indexOf("## Notes for outreach"));
  });

  it("refuses a second draft while one is still waiting, unless forced", async () => {
    const deps = { db, claude, records: memoryRecordStore(), log };
    await draftOutreach(deps, { partnerId: "acme", intent: "intro" }, { voice: "", today: "2026-10-03" });
    await expect(draftOutreach(deps, { partnerId: "acme", intent: "follow-up" }, { voice: "", today: "2026-10-03" })).rejects.toThrow(/waiting in the outbox/);
    await draftOutreach(deps, { partnerId: "acme", intent: "follow-up", force: true }, { voice: "", today: "2026-10-03" });
    expect(await db.select().from(outbox)).toHaveLength(2);
  });

  it("stops when the partner is missing or has no email", async () => {
    const deps = { db, claude, records: memoryRecordStore(), log };
    await expect(draftOutreach(deps, { partnerId: "nobody", intent: "intro" }, { voice: "", today: "x" })).rejects.toThrow(/No partner/);
    await db.insert(partners).values({ id: "mute", name: "Mute" });
    await expect(draftOutreach(deps, { partnerId: "mute", intent: "intro" }, { voice: "", today: "x" })).rejects.toThrow(/primary_email/);
  });
});

describe("appendHistory", () => {
  it("adds a History section when there is none", () => {
    expect(appendHistory("# Acme\n", "x")).toBe("# Acme\n\n## History\n\n- x\n");
  });

  it("appends to the end of the last section", () => {
    expect(appendHistory("# A\n\n## History\n\n- one\n", "two")).toBe("# A\n\n## History\n\n- one\n- two\n");
  });
});
