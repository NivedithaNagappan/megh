import { beforeEach, describe, expect, it } from "vitest";
import { MeghSocketIo } from "./websocket";

describe("MeghSocketIo", () => {
  let meghSocketIo: MeghSocketIo;

  beforeEach(() => {
    meghSocketIo = new MeghSocketIo();
  });

  it("should be defined", () => {
    expect(meghSocketIo).toBeDefined();
  });

  it("should have sendToAll method", () => {
    expect(typeof meghSocketIo.sendToAll).toBe("function");
  });

  it("should have sendOnly method", () => {
    expect(typeof meghSocketIo.sendOnly).toBe("function");
  });

  it("should have sendRoom method", () => {
    expect(typeof meghSocketIo.sendRoom).toBe("function");
  });

  it("should have receive method", () => {
    expect(typeof meghSocketIo.receive).toBe("function");
  });

  it("receive should accept a channel string", () => {
    expect(() => meghSocketIo.receive("test-channel")).not.toThrow();
  });
});
