---
title: Validation
description: Validating request bodies and query strings with DTOs.
---

# Validation

Megh validates request input with [class-validator](https://github.com/typestack/class-validator)
DTOs. Annotate a class, use it as the type of a `@Body()` or `@Query()`
parameter, and validation runs automatically before your handler.

Install `class-validator` and `class-transformer` alongside `@meghjs/core`; they
are peer dependencies since 0.3.

## Defining a DTO

```ts [dtos/create-user.dto.ts]
import { IsString, IsInt, IsEmail, IsOptional, Min, Max } from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsInt()
  @Min(18)
  @Max(120)
  age: number;

  @IsOptional()
  @IsString()
  bio?: string;
}
```

## Validating the body

Type the `@Body()` parameter with the DTO — that is all that is needed:

```ts [controllers/users.controller.ts]
import { ApiController, Post, Body } from '@meghjs/core';
import { CreateUserDto } from '../dtos/create-user.dto';

@ApiController('/users')
export class UsersController {
  @Post()
  create(@Body() body: CreateUserDto) {
    // body is a validated CreateUserDto instance
    return body;
  }
}
```

The handler receives the **transformed DTO instance**, not the raw body, so
class-transformer decorators such as `@Type(() => Number)` apply.

### Unknown properties are rejected

Validation runs with `whitelist` and `forbidNonWhitelisted`. A property that is
not declared on the DTO fails with 400, which prevents mass assignment. Arrays
and primitives sent to an object DTO are rejected too.

### Error response

When validation fails the request is rejected with **400** before the handler
runs:

```json
{
  "code": 400,
  "status": "Error",
  "message": "email must be an email",
  "errors": [
    {
      "path": "email",
      "constraints": { "isEmail": "email must be an email" }
    }
  ]
}
```

`message` joins all messages with `; `. Nested properties use dotted paths
such as `address.city`.

### Without decorator metadata

tsx, esbuild and SWC do not emit decorator metadata, so Megh cannot see the
parameter type. Pass it explicitly:

```ts
create(@Body({ type: CreateUserDto }) body: CreateUserDto) {}
```

## Validating the query string

The same applies to `@Query()`:

```ts
export class ListUsersDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}

@Get()
index(@Query() query: ListUsersDto) {
  return { page: query.page ?? 1 };
}
```

## Deriving DTOs

Rather than repeating fields, derive one DTO from another. The validation rules
come along with the properties.

| Helper | Result |
|--------|--------|
| `PartialType(Dto)` | Every property optional — ideal for updates |
| `PickType(Dto, ['a', 'b'])` | Only the named properties |
| `OmitType(Dto, ['a'])` | Everything except the named properties |

```ts [dtos/update-user.dto.ts]
import { PartialType } from '@meghjs/core';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {}
```

```ts
import { PickType, OmitType } from '@meghjs/core';

export class UserCredentialsDto extends PickType(CreateUserDto, ['email']) {}
export class PublicUserDto extends OmitType(CreateUserDto, ['email']) {}
```

## Extra validators

Megh adds validators on top of the class-validator set:

```ts
import { IsArrayNotEmpty } from '@meghjs/core';

export class CreateOrderDto {
  @IsArrayNotEmpty({ message: 'An order needs at least one item' })
  items: number[];
}
```

## Validating by hand

For input that does not come from a DTO, `validateOrThrow` checks a plain object
against a rule map and throws a `BadRequestException` on failure:

```ts
import { validateOrThrow } from '@meghjs/core';

validateOrThrow(
  { page: 1 },
  { page: { type: 'number', min: 1, required: true } },
);
```

Supported rule types are `string`, `number` (with `min`, `max`, `exact`) and
`boolean`, each accepting `required`, `optional` and a custom `message`.

- `number` accepts any finite number, including `0`.
- `boolean` accepts `true`, `false`, `"true"`, `"false"`, `0`, `1`, `"0"` and
  `"1"`.
- A value of `undefined`, `null` or `""` counts as missing.

To run the DTO pipeline by hand, use `transformAndValidate`:

```ts
import { transformAndValidate } from '@meghjs/core';

const { value, errors } = await transformAndValidate(CreateUserDto, input);
```
