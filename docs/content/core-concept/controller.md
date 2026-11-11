---
title: Controllers
description: Defining routes with controllers, reading route parameters, building REST controllers and returning errors.
---

# Controllers

A controller groups related routes. Mark the class with `@ApiController` and its
methods with a route decorator — `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`.

## Basic controller

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

## REST controller with a built-in collection

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
see [Pagination](/advanced/orm/queries#pagination).

## REST controller with a MeghORM model

With `--model` the generated controller delegates to a service that queries a
[MeghORM](/advanced/orm) model, which keeps data access out of the controller.
The model, its DTOs and the service are generated too if they don't exist yet;
the model's columns are read from the migration that creates its table.

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
  ApiResponse,
  Body,
  Delete,
  Get,
  Paginated,
  Param,
  Post,
  Put,
  Query,
} from '@meghjs/core';
import { User } from '../models/user.model';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from '../dtos/user.dto';
import { UserService } from '../services/user.service';

@ApiController('/users')
export class UsersController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiResponse(200, Paginated(User))
  index(@Query() query: ListUsersQuery) {
    return this.userService.paginate(query);
  }

  @Get('/:id')
  @ApiResponse(200, User)
  @ApiResponse(404)
  show(@Param('id') id: number) {
    return this.userService.findOrFail(id);
  }

  @Post()
  @ApiResponse(200, User)
  create(@Body() body: CreateUserDto) {
    return this.userService.create(body);
  }

  @Put('/:id')
  @ApiResponse(200, User)
  @ApiResponse(404)
  update(@Param('id') id: number, @Body() body: UpdateUserDto) {
    return this.userService.update(id, body);
  }

  @Delete('/:id')
  @ApiResponse(200, { type: 'object', properties: { message: { type: 'string' } } })
  @ApiResponse(404)
  async delete(@Param('id') id: number) {
    await this.userService.delete(id);
    return { message: 'User deleted.' };
  }
}
```

```ts [services/user.service.ts]
import { AppService, type CreateInput, type PageRequest, type UpdateInput } from '@meghjs/core';
import { User } from '../models/user.model';

@AppService
export class UserService {
  findAll() {
    return User.query().orderBy('id').get();
  }

  /** One page of users: `{ data, meta }`. */
  paginate(request: PageRequest = {}) {
    return User.query().orderBy('id').paginate(request);
  }

  /** The user with this id; throws a 404 when there is none. */
  findOrFail(id: number) {
    return User.findOrFail(id);
  }

  create(input: CreateInput<typeof User>) {
    return User.create(input);
  }

  /** `save()` writes only the columns that changed. */
  async update(id: number, changes: UpdateInput<User>) {
    const user = await User.findOrFail(id);
    // A DTO instance holds `undefined` for every field that was not sent.
    const sent = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    return user.fill(sent).save();
  }

  async delete(id: number) {
    const user = await User.findOrFail(id);
    await user.delete();
  }
}
```

```ts [models/user.model.ts]
import { Model, Table, PrimaryKey, AutoIncrement, Column, CreatedAt, UpdatedAt } from '@meghjs/core';

@Table('users')
export class User extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column() name!: string;
  @Column({ unique: true }) email!: string;
  @CreatedAt() created_at?: Date;
  @UpdatedAt() updated_at?: Date;
}
```
:::

`findOrFail` throws a 404 on its own, so the controller needs no
`HttpExceptions.notFound` check. See [MeghORM](/advanced/orm) for connecting the
database, and [Queries](/advanced/orm/queries) for what models can do.

## Throwing errors

`HttpExceptions` covers the common status codes — `notFound`, `badRequest`,
`unauthorized`, `forbidden`, `internalError` — and each takes an optional
message:

```ts
throw HttpExceptions.notFound('User not found');
```
