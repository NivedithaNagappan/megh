import "reflect-metadata";
import { afterEach, describe, expect, it, test } from "vitest";
import { Container, Injectable } from "../di";
import { MeghApplication } from "../core/application";
import { MeghTest } from "../core/testing";
import { ApiController } from "../http/controller";
import { Get } from "../http/route-methods";
import { AuthUser } from "../http/params";
import { MeghAuthentication } from "./authentication";
import { IRequest } from "../core/types";

type User = { id: number; name: string };

@Injectable()
class HeaderAuthentication extends MeghAuthentication<User> {
  async authenticate(request: IRequest): Promise<User | null> {
    const token = request.headers["x-token"];
    return token === "valid" ? { id: 1, name: "Tareq" } : null;
  }
}

@ApiController("me")
class MeController {
  @Get()
  whoami(@AuthUser() user: User) {
    return { user: user ?? null };
  }
}

describe("MeghAuthentication", () => {
  it("resolves the user for valid credentials", async () => {
    const handler = new HeaderAuthentication();
    const req = { headers: { "x-token": "valid" } } as unknown as IRequest;

    await expect(handler.authenticate(req)).resolves.toEqual({
      id: 1,
      name: "Tareq",
    });
  });

  it("returns null when credentials are absent or wrong", async () => {
    const handler = new HeaderAuthentication();

    await expect(
      handler.authenticate({ headers: {} } as unknown as IRequest),
    ).resolves.toBeNull();
    await expect(
      handler.authenticate({
        headers: { "x-token": "nope" },
      } as unknown as IRequest),
    ).resolves.toBeNull();
  });
});

describe("useAuthentication", () => {
  afterEach(() => {
    Container.reset();
  });

  it("rejects anything that is not a class", () => {
    const app = MeghApplication.getInternalApp();
    expect(() => (app as any).useAuthentication({ not: "a class" })).toThrow(
      /expects an authentication class/,
    );
  });

  it("is chainable", () => {
    const app = MeghApplication.getInternalApp();
    expect(app.useAuthentication(HeaderAuthentication)).toBe(app);
  });

  it("populates request.user, which @AuthUser() injects", async () => {
    const app = MeghApplication.getInternalApp();
    app.useAuthentication(HeaderAuthentication);
    app.useControllers([MeController]);

    const test = MeghTest.from(app);
    const res = await test.get("/me", { headers: { "x-token": "valid" } });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user).toEqual({ id: 1, name: "Tareq" });
  });

  it("leaves request.user unset when authentication returns null", async () => {
    const app = MeghApplication.getInternalApp();
    app.useAuthentication(HeaderAuthentication);
    app.useControllers([MeController]);

    const test = MeghTest.from(app);
    const res = await test.get("/me", { headers: { "x-token": "bad" } });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user).toBeNull();
  });

  it("leaves request.user unset when no handler is registered", async () => {
    const app = MeghApplication.getInternalApp();
    app.useControllers([MeController]);

    const test = MeghTest.from(app);
    const res = await test.get("/me", { headers: { "x-token": "valid" } });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user).toBeNull();
  });
});
