import { describe, expect, it } from "vitest";

import { SCREENSHOT_ACCEPT, screenshotContentType, screenshotProblem } from "./uploads";

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe("suggestion screenshots", () => {
  it("takes PNG and JPEG, by type or by extension when the browser doesn't say", () => {
    expect(screenshotContentType(file("a.png", "image/png"))).toBe("image/png");
    expect(screenshotContentType(file("a.JPG", ""))).toBe("image/jpeg");
    expect(screenshotContentType(file("a.jpeg", "application/octet-stream"))).toBe("image/jpeg");
    expect(screenshotContentType(file("a.gif", "image/gif"))).toBeNull();
    expect(screenshotContentType(file("a.png", "image/webp"))).toBeNull();
  });
  it("says why a file can't be a screenshot", () => {
    expect(screenshotProblem(file("a.png", "image/png"))).toBeNull();
    expect(screenshotProblem(file("a.pdf", "application/pdf"))).toBe("Use a PNG or a JPEG.");
    expect(screenshotProblem(file("a.png", "image/png", 0))).toBe("That file is empty.");
    expect(screenshotProblem(file("a.png", "image/png", 3 * 1024 * 1024))).toBe("That picture is 3.0 MB. A screenshot can be up to 2 MB.");
  });
  it("offers the extensions too in the file picker", () => {
    expect(SCREENSHOT_ACCEPT.split(",")).toEqual(["image/png", "image/jpeg", ".png", ".jpg", ".jpeg"]);
  });
});
