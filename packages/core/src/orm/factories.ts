/**
 * Model factories: build and save model rows with fake data, for seeders and
 * tests. Fake values come from Faker (`@faker-js/faker`, installed by the app).
 *
 * ```ts
 * export const UserFactory = defineFactory(User, ({ faker }) => ({
 *   name: faker.person.fullName(),
 *   email: faker.internet.email(),
 *   role_id: RoleFactory, // creates a role and uses its id
 * }));
 *
 * await UserFactory.createMany(10);
 * await UserFactory.state({ is_active: false }).create({ name: "Ann" });
 * ```
 */
import { pathToFileURL } from "node:url";
import type { Faker } from "@faker-js/faker";
import { loadPackageFromClient } from "./core";
import type { CreateInput, ModelClass, Row } from "./types";

/** What a factory definition (and a state function) receives. */
export interface FactoryContext {
  /** The Faker instance: `faker.person.fullName()`, `faker.internet.email()`, … */
  faker: Faker;
  /** 1 for the first row this factory builds, then 2, 3, … */
  sequence: number;
}

/**
 * Column values for a model. A value may be another factory: when the row
 * is built, that factory creates a row and its primary key is used, e.g.
 * `role_id: RoleFactory`.
 */
export type FactoryAttributes<C extends ModelClass> = {
  [K in keyof CreateInput<C>]?: CreateInput<C>[K] | Factory<ModelClass>;
};

type Values<C extends ModelClass> =
  FactoryAttributes<C> | ((context: FactoryContext) => FactoryAttributes<C>);

type Model<C extends ModelClass> = InstanceType<C>;

// A real dynamic import: TypeScript compiles `import()` to `require()` in
// CommonJS output, which cannot load ES modules on older Node versions.
const nativeImport = new Function("url", "return import(url)") as (
  url: string,
) => Promise<any>;

let fakerInstance: Faker | undefined;
let fakerLoading: Promise<Faker> | undefined;

/**
 * Use this Faker instance in factories instead of the default English one,
 * e.g. a locale (`fakerDE`) or one with a fixed seed.
 */
export function useFaker(faker: Faker): void {
  fakerInstance = faker;
}

/** The Faker instance factories use, loaded from the app on first use. */
export function getFaker(): Promise<Faker> {
  if (fakerInstance) return Promise.resolve(fakerInstance);
  fakerLoading ??= loadFaker().then(
    (faker) => (fakerInstance = faker),
    (error) => {
      fakerLoading = undefined; // try again after it is installed
      throw error;
    },
  );
  return fakerLoading;
}

async function loadFaker(): Promise<Faker> {
  let mod: any;
  try {
    // Node 22.12+ can require() Faker's ES modules.
    mod = loadPackageFromClient("@faker-js/faker");
  } catch {
    try {
      const file = require.resolve("@faker-js/faker", {
        paths: [process.cwd()],
      });
      mod = await nativeImport(pathToFileURL(file).href);
    } catch {
      throw new Error(
        "[Megh ORM] Factories use Faker for fake values. Install it: npm install -D @faker-js/faker",
      );
    }
  }
  const faker = mod?.faker ?? mod?.default?.faker;
  if (!faker)
    throw new Error(
      "[Megh ORM] @faker-js/faker has no `faker` export; upgrade it.",
    );
  return faker;
}

/** Builds rows of one model. Every method returns a new factory or a promise. */
export class Factory<C extends ModelClass> {
  constructor(
    readonly model: C,
    private readonly definition: (
      context: FactoryContext,
    ) => FactoryAttributes<C>,
    private readonly states: Values<C>[] = [],
    // Shared by the factories `state()` derives, so sequences don't repeat.
    private readonly counter: { value: number } = { value: 0 },
  ) {}

  /** A factory that also applies these values (or a function returning them). */
  state(values: Values<C>): Factory<C> {
    return new Factory(
      this.model,
      this.definition,
      [...this.states, values],
      this.counter,
    );
  }

  /** Start `sequence` from 1 again. */
  resetSequence(): this {
    this.counter.value = 0;
    return this;
  }

  /**
   * The column values for one row, without saving it. Values that are
   * factories are created, so their keys are real.
   */
  async raw(overrides?: Values<C>): Promise<Partial<CreateInput<C>>> {
    const context: FactoryContext = {
      faker: await getFaker(),
      sequence: ++this.counter.value,
    };
    const values: Record<string, unknown> = { ...this.definition(context) };
    for (const state of [...this.states, ...(overrides ? [overrides] : [])]) {
      Object.assign(
        values,
        typeof state === "function" ? state(context) : state,
      );
    }
    for (const [key, value] of Object.entries(values)) {
      if (value instanceof Factory) {
        const parent: any = await value.create();
        values[key] = parent[value.model.primaryKey];
      }
    }
    return values as Partial<CreateInput<C>>;
  }

  /** A model instance with the values, not saved: call `save()` to insert it. */
  async make(overrides?: Values<C>): Promise<Model<C>> {
    const instance = new this.model() as Model<C>;
    (instance as any).fill(await this.raw(overrides));
    return instance;
  }

  /** `count` unsaved model instances. */
  async makeMany(count: number, overrides?: Values<C>): Promise<Model<C>[]> {
    const out: Model<C>[] = [];
    for (let i = 0; i < count; i++) out.push(await this.make(overrides));
    return out;
  }

  /** Insert one row and return it. */
  async create(overrides?: Values<C>): Promise<Row<Model<C>>> {
    return (this.model as any).create(await this.raw(overrides));
  }

  /** Insert `count` rows, one by one (each with its own fake values), and return them. */
  async createMany(
    count: number,
    overrides?: Values<C>,
  ): Promise<Row<Model<C>>[]> {
    const out: Row<Model<C>>[] = [];
    for (let i = 0; i < count; i++) out.push(await this.create(overrides));
    return out;
  }
}

/**
 * Define a factory for a model. The definition returns fake column values;
 * `state()` and the `overrides` of `make()` / `create()` replace them.
 */
export function defineFactory<C extends ModelClass>(
  model: C,
  definition: (context: FactoryContext) => FactoryAttributes<C>,
): Factory<C> {
  return new Factory(model, definition);
}
