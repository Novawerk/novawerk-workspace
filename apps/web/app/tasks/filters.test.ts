import { describe, expect, it } from "vitest";

import { activeFilterCount, DEFAULT_FILTERS, filtersFrom, filtersToApiQuery, filtersToSearch } from "./filters";

const from = (q: string) => filtersFrom(new URLSearchParams(q));

describe("board filters in the URL", () => {
  it("reads defaults from an empty query", () => {
    expect(from("")).toEqual(DEFAULT_FILTERS);
    expect(filtersToSearch(DEFAULT_FILTERS)).toBe("");
    expect(filtersToApiQuery(DEFAULT_FILTERS)).toBe("");
  });

  it("keeps only known values, once each", () => {
    const f = from("area=web,nope,web,api&size=XXL,M&status=bogus&sort=votes&view=board");
    expect(f.area).toEqual(["web", "api"]);
    expect(f.size).toEqual(["M"]);
    expect(f.status).toBe("active");
    expect(f.sort).toBe("votes");
    expect(f.view).toBe("board");
  });

  it("round-trips through the page URL", () => {
    const f = from("mine=1&q=outbox&area=admin&status=open&skills=react&view=board");
    expect(from(filtersToSearch(f))).toEqual(f);
  });

  it("asks the API without the view or 'mine', and with the cursor", () => {
    const f = from("mine=1&area=web,api&view=board&q=dark mode");
    expect(filtersToApiQuery(f, "abc")).toBe("area=web,api&q=dark+mode&cursor=abc");
  });

  it("counts filters, not the view", () => {
    expect(activeFilterCount(from("area=web,api&size=S&view=board&sort=votes"))).toBe(4);
  });
});
