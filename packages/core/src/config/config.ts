import { Environment } from "./environment-variables";
import { Constructor, inject } from "../common/helpers";
import { Container, Injectable } from "../di";
// The abstract base
export abstract class MeghConfig<T = any> {
  abstract config(env: Environment): T;
}

// Constructor type that TypeScript recognizes for subclasses
export type MeghConfigClass<T = any> = Function & {
  prototype: MeghConfig<T>;
};

// Decorator — registers in DI
export function AppConfig<T extends MeghConfig>(
  target: Constructor<T>,
): Constructor<T> {
  Injectable()(target);
  return target;
}
export function GetConfig<T extends MeghConfig<R>, R>(
  ConfigClass: Constructor<T>,
): R;
export function GetConfig<T = any>(token: string | symbol): T;
export function GetConfig<R>(token: any): R {
  if (
    typeof token === "function" &&
    token.prototype != null &&
    typeof token.prototype.config === "function"
  ) {
    try {
      const instance = Container.get<MeghConfig<R>>(
        token as Constructor<MeghConfig<R>>,
      );
      return instance.config(inject(Environment));
    } catch {
      throw new Error(
        `Config class "${(token as Constructor<unknown>).name}" is not registered. ` +
          "Did you forget to apply the @AppConfig decorator?",
      );
    }
  }
  try {
    return Container.get<R>(token);
  } catch {
    throw new Error(
      `Config token "${String(token)}" is not registered in the container.`,
    );
  }
}
