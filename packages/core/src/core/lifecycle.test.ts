import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeghApplication } from "./application";

// A fresh app per test; getApp() would return a shared singleton.
const createApp = () => MeghApplication.getInternalApp();

describe("application lifecycle", () => {
  const apps: MeghApplication[] = [];
  const started = (app: MeghApplication) => (apps.push(app), app);

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    vi.restoreAllMocks();
  });

  it("runs init hooks in order before listening, and ready hooks after", async () => {
    const app = started(createApp());
    const calls: string[] = [];
    const listening = () => app.app.server.listening;

    app
      .onInit(() => {
        calls.push(`init1 listening=${listening()}`);
      })
      .onInit(async () => {
        calls.push(`init2 listening=${listening()}`);
      })
      .onReady(() => {
        calls.push(`ready listening=${listening()}`);
      });
    await app.run(0);

    expect(calls).toEqual([
      "init1 listening=false",
      "init2 listening=false",
      "ready listening=true",
    ]);
  });

  it("aborts run() when an init hook fails, without listening", async () => {
    const app = started(createApp());
    const ready = vi.fn();
    app.onInit(() => {
      throw new Error("db down");
    });
    app.onReady(ready);

    await expect(app.run(0)).rejects.toThrow("db down");

    expect(app.app.server.listening).toBe(false);
    expect(ready).not.toHaveBeenCalled();
  });

  it("rejects init and ready hooks registered after run()", async () => {
    const app = started(createApp());
    await app.run(0);

    expect(() => app.onInit(() => {})).toThrow(
      "onInit() must be called before run()",
    );
    expect(() => app.onReady(() => {})).toThrow(
      "onReady() must be called before run()",
    );
  });

  it("closes the server, then runs close hooks in reverse order", async () => {
    const app = started(createApp());
    const calls: string[] = [];
    app
      .onClose(() => {
        calls.push(`first listening=${app.app.server.listening}`);
      })
      .onClose(async () => {
        calls.push("second");
      });
    await app.run(0);

    await app.close();

    expect(calls).toEqual(["second", "first listening=false"]);
  });

  it("keeps running close hooks after one fails, and closes only once", async () => {
    const app = started(createApp());
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const last = vi.fn();
    app.onClose(last).onClose(() => {
      throw new Error("flush failed");
    });
    await app.run(0);

    await Promise.all([app.close(), app.close()]);
    await app.close();

    expect(last).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(
      "[Megh] onClose hook failed:",
      expect.any(Error),
    );
  });

  it("closes the app and exits on SIGTERM", async () => {
    const app = started(createApp());
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as any);
    const closed = vi.fn();
    app.onClose(closed);
    await app.run(0);

    process.emit("SIGTERM");

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
