/**
 * @copyright 2024
 * @author Tareq Hossain
 * @email xtrinsic96@gmail.com
 * @url https://github.com/xtareq
 */
import { MeghContainer as Container, loadPackageFromClient } from "@meghjs/core";
import type { DataSource } from "typeorm";

/**
 * String token under which the TypeORM `DataSource` is registered. Used by
 * `paginatedRepository` and `@InjectRepository`.
 */
export const DATASOURCE_TOKEN = "idatasource";

/**
 * Register the application's TypeORM `DataSource` with the DI container.
 *
 * Sets both the `"idatasource"` string token and the `DataSource` class token
 * (the class the instance was built from, and the consumer's `typeorm`
 * `DataSource` export if that differs), so `@Repository`, `@InjectRepository`,
 * `paginatedRepository` and `Container.get(DataSource)` all resolve it.
 */
export function registerDataSource(dataSource: DataSource): DataSource {
  if (!dataSource) {
    throw new Error(
      "[Megh] registerDataSource() requires a DataSource instance.",
    );
  }

  Container.set(DATASOURCE_TOKEN, dataSource);

  const ctor = (dataSource as any).constructor;
  if (typeof ctor === "function" && ctor !== Object) {
    Container.set(ctor, dataSource);
  }

  try {
    const typeorm = loadPackageFromClient<typeof import("typeorm")>("typeorm");
    if (typeorm?.DataSource && typeorm.DataSource !== ctor) {
      Container.set(typeorm.DataSource, dataSource);
    }
  } catch {
    // typeorm not resolvable from the app root; the constructor token is enough.
  }

  return dataSource;
}

/**
 * Resolve the registered TypeORM `DataSource`, or throw a clear error if the
 * application has not called `useTypeORM` (or `registerDataSource`) yet.
 */
export function getDataSource(): DataSource {
  if (Container.has(DATASOURCE_TOKEN)) {
    return Container.get<DataSource>(DATASOURCE_TOKEN);
  }

  try {
    const typeorm = loadPackageFromClient<typeof import("typeorm")>("typeorm");
    if (Container.has(typeorm.DataSource)) {
      return Container.get(typeorm.DataSource);
    }
  } catch {
    // fall through to the error below
  }

  throw new Error(
    "[Megh] No TypeORM DataSource is registered. Call app.useTypeORM(...) " +
      "(or registerDataSource(dataSource)) before resolving repositories.",
  );
}
