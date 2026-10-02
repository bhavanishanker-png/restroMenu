import { expect, it } from "vitest";
import { cn } from "@/lib/utils";
it("keeps custom sizes next to colours", () => {
  expect(cn("text-body-xs text-on-surface-variant")).toBe("text-body-xs text-on-surface-variant");
  expect(cn("text-label-bold", "text-brand-text")).toBe("text-label-bold text-brand-text");
  expect(cn("text-body-sm", "text-body-lg")).toBe("text-body-lg");
  expect(cn("text-sm", "text-body-md")).toBe("text-body-md");
  expect(cn("text-error", "text-success")).toBe("text-success");
});
