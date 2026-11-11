import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { LoggerService, buildLoggerOptions } from "./logger";
import pino from "pino";

vi.mock("pino");

const prettyTransport = {
  target: "pino-pretty",
  options: {
    translateTime: "SYS:standard",
    ignore: "pid,hostname",
  },
};

describe("LoggerService constructor", () => {
  const mockPino = pino as unknown as Mock;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockPino.mockClear();
    mockPino.mockImplementation(() => ({}));
    // Reset the shared instance so each test builds a fresh one.
    (LoggerService as any).root = undefined;
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should initialize logger with default level 'info' when LOG_LEVEL is not set", () => {
    delete process.env.LOG_LEVEL;
    new LoggerService();
    expect(mockPino).toHaveBeenCalledWith({
      level: "info",
      mixin: expect.any(Function),
    });
  });

  it("should initialize logger with LOG_LEVEL from environment", () => {
    process.env.LOG_LEVEL = "debug";
    new LoggerService();
    expect(mockPino).toHaveBeenCalledWith({
      level: "debug",
      mixin: expect.any(Function),
    });
  });

  it("should share one pino instance across LoggerService instances", () => {
    const a = new LoggerService();
    const b = new LoggerService();
    expect(mockPino).toHaveBeenCalledTimes(1);
    expect(a.getLogger()).toBe(b.getLogger());
  });
});

describe("buildLoggerOptions", () => {
  it("should emit plain JSON options outside development", () => {
    expect(buildLoggerOptions({}, { NODE_ENV: "production" })).toEqual({
      level: "info",
      mixin: expect.any(Function),
    });
  });

  it("should use pino-pretty when pretty is enabled", () => {
    expect(buildLoggerOptions({ pretty: true, level: "warn" }, {})).toEqual({
      level: "warn",
      mixin: expect.any(Function),
      transport: prettyTransport,
    });
  });

  it("should prefer config.level over LOG_LEVEL", () => {
    expect(
      buildLoggerOptions({ level: "error" }, { LOG_LEVEL: "debug" }),
    ).toEqual({ level: "error", mixin: expect.any(Function) });
  });
});
