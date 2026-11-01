import { describe, expect, it } from "vitest";
import { Megh } from "./testing";
import { MeghApplication } from "./application";

describe("Megh.createApplication", () => {
  it("should return an instance of MeghApplication", () => {
    const app = Megh.createApplication();
    expect(app).toBeInstanceOf(MeghApplication);
  });

  it("should always return the same instance (singleton)", () => {
    const app1 = Megh.createApplication();
    const app2 = Megh.createApplication();
    expect(app1).toBe(app2);
  });
});
