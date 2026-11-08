import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Container,
  ContainerError,
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

describe("Container errors", () => {
  afterEach(() => {
    Container.reset();
  });

  it("explains how to register an unknown class", () => {
    class Unregistered {}

    expect(() => Container.get(Unregistered)).toThrow(ContainerError);
    expect(() => Container.get(Unregistered)).toThrow(
      "Unregistered is not registered. Mark it with @Injectable() (or @AppService), or register an instance with MeghContainer.set(Unregistered, value).",
    );
  });

  it("names the token or string that has no value", () => {
    expect(() => Container.get(new Token("MISSING"))).toThrow(
      /Nothing is registered for Token "MISSING"/,
    );
    expect(() => Container.get("missing-name")).toThrow(
      /Nothing is registered for "missing-name"/,
    );
  });

  it("shows which constructor needed the missing dependency", () => {
    class Mailer {}
    @Injectable()
    class Notifier {
      constructor(readonly mailer: Mailer) {}
    }
    @Injectable()
    class Signup {
      constructor(readonly notifier: Notifier) {}
    }

    expect(() => Container.get(Signup)).toThrow(
      "Cannot construct Signup -> Notifier: Mailer is not registered.",
    );
  });

  it("reports a dependency cycle instead of overflowing the stack", () => {
    @Injectable()
    class A {
      constructor() {
        Container.get(B);
      }
    }
    @Injectable()
    class B {
      constructor() {
        Container.get(A);
      }
    }

    expect(() => Container.get(A)).toThrow("Circular dependency: A -> B -> A.");
  });

  it("can construct a class again after a constructor threw", () => {
    let fail = true;
    @Injectable()
    class Flaky {
      constructor() {
        if (fail) throw new Error("boom");
      }
    }

    expect(() => Container.get(Flaky)).toThrow("boom");
    fail = false;
    expect(Container.get(Flaky)).toBeInstanceOf(Flaky);
  });
});

describe("Container resolution", () => {
  afterEach(() => {
    Container.reset();
  });

  it("leaves interface and primitive constructor parameters undefined", () => {
    interface Options {
      retries: number;
    }
    @Injectable()
    class Client {
      constructor(
        readonly name: string,
        readonly options: Options,
      ) {}
    }

    const client = Container.get(Client);
    expect(client.name).toBeUndefined();
    expect(client.options).toBeUndefined();
  });

  it("knows a decorated class before it is constructed", () => {
    @Injectable()
    class Lazy {}
    expect(Container.has(Lazy)).toBe(true);
  });

  it("rebuilds a class that was replaced with set() once reset", () => {
    @Injectable()
    class Mailer {
      kind = "real";
    }
    Container.set(Mailer, { kind: "fake" });
    expect(Container.get(Mailer).kind).toBe("fake");

    Container.reset();

    expect(Container.get(Mailer).kind).toBe("real");
  });

  it("does not let @Injectable() discard a value set earlier", () => {
    class Late {}
    const value = new Late();
    Container.set(Late, value);

    Injectable()(Late);

    expect(Container.get(Late)).toBe(value);
  });

  it("injects into a subclass that inherits its parent's constructor", () => {
    @Injectable()
    class Clock {}
    @Injectable()
    class Base {
      constructor(readonly clock: Clock) {}
    }
    @Injectable()
    class Child extends Base {}

    expect(Container.get(Child).clock).toBe(Container.get(Clock));
  });

  it("shares one registry across copies of the module", async () => {
    const DB = new Token<string>("SHARED_DB");
    Container.set(DB, "one");

    vi.resetModules();
    const copy = await import("./container");

    expect(copy.Container).not.toBe(Container);
    expect(copy.Container.get(DB)).toBe("one");
  });
});

describe("createInjectDecorator", () => {
  afterEach(() => {
    Container.reset();
  });

  it("applies a parent's parameter handler to a subclass without its own constructor", () => {
    const InjectGreeting = () => createInjectDecorator(() => "hi");
    @Injectable()
    class Base {
      constructor(@InjectGreeting() readonly greeting: string) {}
    }
    @Injectable()
    class Child extends Base {}

    expect(Container.get(Child).greeting).toBe("hi");
  });

  it("injects properties declared on a parent class", () => {
    const InjectValue = () => createInjectDecorator(() => 7);
    class Base {
      @InjectValue()
      value!: number;
    }
    @Injectable()
    class Child extends Base {}

    expect(Container.get(Child).value).toBe(7);
  });

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
