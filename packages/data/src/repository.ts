import {
  createInjectDecorator,
  normalizePageRequest,
  paginated,
  type PageRequest,
  type Paginated,
} from "@meghjs/core";
import type { EntityTarget, ObjectLiteral, Repository } from "typeorm";
import { getDataSource } from "./datasource";

/** A TypeORM repository extended with the unified `paginate`. */
export type PaginatedRepository<T extends ObjectLiteral> = Repository<T> & {
  paginate(options?: PageRequest): Promise<Paginated<T>>;
};

async function paginateRepository<T extends ObjectLiteral>(
  repo: Repository<T>,
  options?: PageRequest,
): Promise<Paginated<T>> {
  const { page, perPage, offset } = normalizePageRequest(options);
  const [data, total] = await repo.findAndCount({
    skip: offset,
    take: perPage,
  });
  return paginated(data, total, page, perPage);
}

/**
 * The TypeORM repository for `entity`, from the registered DataSource, with
 * the unified `paginate({ page, perPage })` added.
 */
export function paginatedRepository<T extends ObjectLiteral>(
  entity: EntityTarget<T>,
  dataSource = getDataSource(),
): PaginatedRepository<T> {
  return dataSource.getRepository<T>(entity).extend({
    paginate(this: Repository<T>, options?: PageRequest) {
      return paginateRepository(this, options);
    },
  }) as PaginatedRepository<T>;
}

/**
 * Inject the TypeORM repository for `model`, extended with the unified
 * `paginate({ page, perPage })`. Requires a registered DataSource.
 */
export function InjectRepository<T extends ObjectLiteral>(
  model: EntityTarget<T>,
) {
  return createInjectDecorator(() => paginatedRepository(model));
}
