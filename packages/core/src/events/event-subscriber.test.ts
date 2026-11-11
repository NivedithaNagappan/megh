import "reflect-metadata";
import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventSubscriberRegistry, Subscribe } from "./event-subscriber";
import { SocketContextService } from "./socket-dispatcher";
import { LoggerService } from "../observability/logger";
import { Injectable } from "../di";

@Injectable()
class ChatSubscriber {
  static received: unknown[] = [];

  @Subscribe("chat:fail")
  async fail() {
    throw new Error("listener blew up");
  }

  @Subscribe("chat:ok")
  ok(payload: unknown) {
    ChatSubscriber.received.push(payload);
  }
}

function fakeSocket() {
  return Object.assign(new EventEmitter(), { data: {} }) as any;
}

describe("EventSubscriberRegistry", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs a failing listener instead of leaving an unhandled rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const error = vi.fn();
    vi.spyOn(LoggerService, "child").mockReturnValue({
      error,
      debug: () => {},
      info: () => {},
      warn: () => {},
    } as any);

    try {
      const socket = fakeSocket();
      new EventSubscriberRegistry(new SocketContextService()).register(socket);

      socket.emit("chat:fail", {});
      socket.emit("chat:ok", { text: "hi" });

      await vi.waitFor(() => expect(error).toHaveBeenCalled());
      await new Promise((r) => setImmediate(r));
      expect(unhandled).not.toHaveBeenCalled();
      expect(error.mock.calls[0][0]).toMatchObject({
        channel: "chat:fail",
        listener: "ChatSubscriber.fail",
      });
      expect(ChatSubscriber.received).toEqual([{ text: "hi" }]);
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
