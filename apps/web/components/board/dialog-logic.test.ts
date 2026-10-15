import { describe, expect, it } from "vitest";

import { closesOnBackdropClick, confirmPromptOpen } from "./dialog-logic";

describe("closesOnBackdropClick", () => {
  const base = { clickOnDialog: true, pressStartedOnDialog: true, closeOnBackdrop: true, dismissible: true };
  it("closes on a press that starts and ends on the backdrop", () => {
    expect(closesOnBackdropClick(base)).toBe(true);
  });
  it("ignores a drag out of a field that ends over the backdrop", () => {
    expect(closesOnBackdropClick({ ...base, pressStartedOnDialog: false })).toBe(false);
  });
  it("ignores clicks inside the panel", () => {
    expect(closesOnBackdropClick({ ...base, clickOnDialog: false })).toBe(false);
  });
  it("never closes a dialog that opts out of the backdrop, or can't be dismissed", () => {
    expect(closesOnBackdropClick({ ...base, closeOnBackdrop: false })).toBe(false);
    expect(closesOnBackdropClick({ ...base, dismissible: false })).toBe(false);
  });
});

describe("confirmPromptOpen", () => {
  it("asks a signed-out visitor with a confirm link to sign in", () => {
    expect(confirmPromptOpen({ confirmId: "p1", status: "signed-out", closedByUser: false })).toBe(true);
  });
  it("waits while the session is still loading, and stays away once signed in", () => {
    expect(confirmPromptOpen({ confirmId: "p1", status: "loading", closedByUser: false })).toBe(false);
    expect(confirmPromptOpen({ confirmId: "p1", status: "signed-in", closedByUser: false })).toBe(false);
  });
  it("stays closed after the visitor closes it, and needs a confirm link", () => {
    expect(confirmPromptOpen({ confirmId: "p1", status: "signed-out", closedByUser: true })).toBe(false);
    expect(confirmPromptOpen({ confirmId: null, status: "signed-out", closedByUser: false })).toBe(false);
  });
});
