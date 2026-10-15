import { describe, expect, it } from "vitest";

import { cleanPath } from "./analytics";

describe("cleanPath", () => {
  it("drops the handle from profile addresses", () => {
    expect(cleanPath("/u/lena-k")).toBe("/u/_");
    expect(cleanPath("/u/lena-k/edit")).toBe("/u/_/edit");
    expect(cleanPath("/tasks/NW-42")).toBe("/tasks/NW-42");
    expect(cleanPath("/users")).toBe("/users");
  });
});
