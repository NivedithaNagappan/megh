---
title: Controller
description: Megh Controller
---

# Controller

A controller groups related routes. Mark the class with `@ApiController` and its
methods with a route decorator — `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`.

## Basic Controller

```sh
npx megh make:controller welcome
```

```ts [src/controllers/welcome.controller.ts]
import { ApiController, Get } from '@meghjs/core';

@ApiController('/welcome')
export class WelcomeController {
  @Get()
  sayHello() {
    return 'Hello';
  }
}
```

Register it on the app:

```ts [app.ts]
import { Megh } from '@meghjs/core';
import { WelcomeController } from './controllers/welcome.controller';

const app = Megh.createApplication();
app.useControllers([WelcomeController]);

export default app;
```

`@ApiController` may be used bare, in which case routes mount at the root:

```ts
@ApiController
export class WelcomeController {}
```

## Route parameters

| Decorator | Reads from |
|-----------|------------|
| `@Param('id')` | Route path segment |
| `@Query()` | Query string |
| `@Body()` | Request body |
| `@Header('x-token')` | Request header |
| `@AuthUser()` | The authenticated user |

```ts
@Get('/:id')
findOne(@Param('id') id: number) {
  return { id };
}
```

## REST controller with in-built collection

`Collection` holds items in memory — useful for prototypes and tests, with no
database required.

```sh
npx megh make:controller users --model user --rest
```

or shorthand

```sh
npx megh m:c users -m user -r
```

::: code-group
```ts [users.controller.ts]
import {
  ApiController,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Collection,
  HttpExceptions,
} from '@meghjs/core';
import { User } from '../models/user';

@ApiController('/users')
export class UsersController {
  private readonly users = Collection.from<User>([
    { id: 1, name: 'test 1', age: 20, active: true },
    { id: 2, name: 'test 2', age: 45, active: true },
    { id: 3, name: 'test 3', age: 38, active: false },
  ]);

  @Get()
  findAll() {
    return this.users.find();
  }

  @Get('/:id')
  findOne(@Param('id') id: number) {
    const user = this.users.findOne((u) => u.id === id);
    if (!user) throw HttpExceptions.notFound('User not found');
    return user;
  }

  @Post()
  create(@Body() createBody: Partial<User>) {
    const lastId = this.users.max('id');
    return this.users.add({ ...createBody, id: lastId + 1 });
  }

  @Put('/:id')
  update(@Param('id') id: number, @Body() updateBody: Partial<User>) {
    const user = this.users.findOne((u) => u.id === id);
    if (!user) throw HttpExceptions.notFound('User not found');
    this.users.update((u) => u.id === id, updateBody);
    return 'Updated Successfully';
  }

  @Delete('/:id')
  delete(@Param('id') id: number) {
    const user = this.users.findOne((u) => u.id === id);
    if (!user) throw HttpExceptions.notFound('User not found');
    this.users.delete((u) => u.id === id);
    return 'Deleted Successfully';
  }
}
```

```ts [models/user.ts]
export class User {
  id: number;
  name: string;
  age: number;
  active: boolean;
}
```
:::

`Collection` also offers `paginate({ page, perPage })`, `max`, `min`, `sum`, `avg`,
`updateBy`, `deleteBy` and async variants (`findAsync`, `findOneAsync`).
`paginate` returns the same `{ data, meta }` shape as the database paginators;
see [Pagination](/advanced/database#pagination).

## REST controller with typeorm repository

With `--orm` the generated controller delegates to a service holding a TypeORM
repository, which keeps data access out of the controller.

```sh
npx megh make:controller users --model user --rest --orm
```

or shorthand

```sh
npx megh m:c users -m user -r --orm
```

::: code-group
```ts [users.controller.ts]
import {
  ApiController,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  HttpExceptions,
} from '@meghjs/core';
import { UserService } from '../services/user.service';
import { User } from '../models/user';

@ApiController('/users')
export class UsersController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async index(@Query() query?: any) {
    if (query && query.page) {
      return this.userService.paginate(Number(query.page));
    }
    return this.userService.findAll();
  }

  @Get('/:id')
  async findOne(@Param('id') id: number) {
    const user = await this.userService.findByPk(id);
    if (!user) throw HttpExceptions.notFound('User not found');
    return user;
  }

  @Post()
  async create(@Body() body: Partial<User>) {
    return this.userService.create(body);
  }

  @Put('/:id')
  async update(@Param('id') id: number, @Body() updateBody: Partial<User>) {
    const user = await this.userService.findByPk(id);
    if (!user) throw HttpExceptions.notFound('User not found');
    return this.userService.update(id, updateBody);
  }

  @Delete('/:id')
  async delete(@Param('id') id: number) {
    const user = await this.userService.findByPk(id);
    if (!user) throw HttpExceptions.notFound('User not found');
    return this.userService.delete(id);
  }
}
```

```ts [services/user.service.ts]
import { AppService } from '@meghjs/core';
import { InjectRepository, PaginatedRepository } from '@meghjs/data';
import { User } from '../models/user';

@AppService
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: PaginatedRepository<User>,
  ) {}

  findAll() {
    return this.userRepository.find();
  }

  paginate(page = 1, perPage = 10) {
    return this.userRepository.paginate({ page, perPage });
  }

  findByPk(id: number) {
    return this.userRepository.findOneBy({ id });
  }

  create(body: Partial<User>) {
    const user = this.userRepository.create(body);
    return this.userRepository.save(user);
  }

  async update(id: number, body: Partial<User>) {
    const result = await this.userRepository.update({ id }, body);
    return (result.affected ?? 0) > 0;
  }

  async delete(id: number) {
    const result = await this.userRepository.delete({ id });
    return (result.affected ?? 0) > 0;
  }
}
```

```ts [models/user.ts]
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'user' })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```
:::

See [Database](/advanced/database) for connecting the datasource.

## Throwing errors

`HttpExceptions` covers the common status codes — `notFound`, `badRequest`,
`unauthorized`, `forbidden`, `internalError` — and each takes an optional
message:

```ts
throw HttpExceptions.notFound('User not found');
```
