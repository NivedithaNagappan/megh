import "reflect-metadata";
import { afterEach, describe, expect, it } from "vitest";
import {
  Container,
  Injectable,
  Token,
  createInjectDecorator,
} from "./container";

describe("Container", () => {
  afterEach(() => {
    Container.reset();
  });

  it("constructs an @Injectable class with its constructor dependencies", () => {
    @Injectable()
    class Clock {
      now() {
        return 42;
      }
    }
    @Injectable()
    class Greeter {
      constructor(readonly clock: Clock) {}
    }

    const greeter = Container.get(Greeter);
    expect(greeter.clock.now()).toBe(42);
    expect(Container.get(Greeter)).toBe(greeter);
  });

  it("stores and resolves values by token", () => {
    const DB_URL = new Token<string>("DB_URL");
    expect(Container.has(DB_URL)).toBe(false);

    Container.set(DB_URL, "postgres://localhost");

    expect(Container.has(DB_URL)).toBe(true);
    expect(Container.get(DB_URL)).toBe("postgres://localhost");
  });

  it("lets a set value replace the class a dependent receives", () => {
    @Injectable()
    class Mailer {
      send() {
        return "real";
      }
    }
    @Injectable()
    class Signup {
      constructor(readonly mailer: Mailer) {}
    }

    Container.set(Mailer, { send: () => "fake" });

    expect(Container.get(Signup).mailer.send()).toBe("fake");
  });

  it("rebuilds class instances after reset, keeping token values", () => {
    @Injectable()
    class Counter {}
    const NAME = new Token<string>("NAME");
    const before = Container.get(Counter);
    Container.set(NAME, "megh");

    Container.reset();

    expect(Container.get(Counter)).not.toBe(before);
    expect(Container.get(NAME)).toBe("megh");
  });

  it("discards instances on reset without calling their destroy()", () => {
    class Connection {
      destroyed = false;
      destroy() {
        this.destroyed = true;
      }
    }
    const conn = new Connection();
    Container.set(Connection, conn);

    Container.reset();

    expect(conn.destroyed).toBe(false);
  });
});

describe("createInjectDecorator", () => {
  it("injects the factory's value into a constructor parameter and a property", () => {
    const InjectGreeting = () => createInjectDecorator(() => "hello");

    @Injectable()
    class Service {
      @InjectGreeting()
      greeting!: string;

      constructor(@InjectGreeting() readonly fromConstructor: string) {}
    }

    const service = Container.get(Service);
    expect(service.fromConstructor).toBe("hello");
    expect(service.greeting).toBe("hello");
  });
});
