---
title: Validation
description: Validating request bodies and query strings with DTOs, using Megh's validation decorators or class-validator.
---

# Validation

Megh validates request input with DTOs: classes whose properties carry
validation decorators. Use a DTO as the type of a `@Body()` or `@Query()`
parameter, and validation runs before your handler.

The decorators come from `@meghjs/core`. They have the same names, options and
error messages as [class-validator](https://github.com/typestack/class-validator)
and [class-transformer](https://github.com/typestack/class-transformer), and
Megh compiles each DTO's rules once into a single function, so validation is
much faster. DTOs written with class-validator keep working; see
[Switching from class-validator](#switching-from-class-validator).

## Defining a DTO

```ts [dtos/create-user.dto.ts]
import { IsString, IsInt, IsEmail, IsOptional, Min, Max } from '@meghjs/core';

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

The handler receives the **DTO instance**, not the raw body: getters and
methods on the class work, and [`@Type` and `@Transform`](#converting-values)
have been applied.

### Unknown properties are rejected

A property that is not declared on the DTO fails with 400, which prevents mass
assignment. Arrays and primitives sent to an object DTO are rejected too. To
accept a property without checking it, mark it with `@Allow()`.

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
such as `address.city` and `items.0.name`.

Every decorator takes a `message` option, as a string or a function.
`$property`, `$value`, `$target` and `$constraint1`, `$constraint2`… are
filled in:

```ts
@MinLength(8, { message: '$property needs at least $constraint1 characters' })
password: string;
```

### Without decorator metadata

tsx, esbuild and SWC do not emit decorator metadata, so Megh cannot see the
parameter type. Pass it explicitly:

```ts
create(@Body({ type: CreateUserDto }) body: CreateUserDto) {}
```

## Validating the query string

The same applies to `@Query()`. Query values arrive as strings; Megh converts
them to the property's type (`?page=2` becomes the number `2`) before
validating:

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

## Decorators

| Kind | Decorators |
|------|------------|
| Presence | `IsOptional`, `IsDefined`, `IsNotEmpty`, `IsEmpty`, `Allow`, `ValidateIf(condition)` |
| Type | `IsString`, `IsNumber(options?)`, `IsInt`, `IsBoolean`, `IsDate`, `IsArray`, `IsObject`, `IsEnum(entity)` |
| Values | `IsIn(values)`, `IsNotIn(values)` |
| Numbers | `Min(n)`, `Max(n)`, `IsPositive`, `IsNegative` |
| Strings | `MinLength(n)`, `MaxLength(n)`, `Length(min, max?)`, `Matches(pattern, modifiers?)`, `IsEmail(options?)`, `IsUUID(version?)`, `IsUrl(options?)` |
| Arrays | `ArrayNotEmpty`, `ArrayMinSize(n)`, `ArrayMaxSize(n)` |
| Nested | `ValidateNested`, with `Type(() => Class)` |
| Conversion | `Type(() => Class)`, `Transform(fn)` |

They behave as their class-validator namesakes. Pass `{ each: true }` to check
every item of an array instead of the array itself:

```ts
@IsString({ each: true })
@MaxLength(20, { each: true })
tags: string[];
```

`IsOptional` skips the other rules when the value is `null` or `undefined`.
`ValidateIf((dto, value) => …)` skips them when the condition is false.

### Email, UUID and URL

`@IsEmail()` with default options is checked by Megh itself and accepts exactly
the addresses class-validator accepts. `@IsUUID()`, `@IsUrl()` and
`@IsEmail(options)` with options use the [validator](https://github.com/validatorjs/validator.js)
package, as class-validator does; install it to use them:

```sh
npm i validator
```

An address containing an unpaired UTF-16 surrogate fails `@IsEmail` with the
normal 400 (class-validator throws on it, which becomes a 500).

## Nested objects

Mark the property with `@ValidateNested()` and give its class with
`@Type()`, so the value becomes an instance of that class and is validated
with its own rules. Arrays work the same way:

```ts
import { IsString, MinLength, ValidateNested, Type, IsArray } from '@meghjs/core';

class AddressDto {
  @IsString()
  @MinLength(2)
  city: string;
}

class ItemDto {
  @IsString()
  sku: string;
}

export class CreateOrderDto {
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items: ItemDto[];
}
```

Unknown properties are rejected inside nested objects too. Errors use dotted
paths: `address.city`, `items.1.sku`.

## Converting values

`@Type(() => X)` converts a value before it is validated: `Number`, `String`,
`Boolean` and `Date` convert primitives (`Boolean('false')` is `true`, as in
class-transformer), and a class turns a nested object into an instance.

`@Transform` changes a value with your own function. It receives
`{ value, key, obj, type, options }` and returns the new value:

```ts
import { IsIn, Transform } from '@meghjs/core';

export class ListUsersDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['name', 'email'])
  sort: string;
}
```

Like class-transformer, a transform only runs for properties present in the
input; defaults set on the class (`sort = 'name'`) apply when it is missing.

## Switching from class-validator

Existing class-validator DTOs keep working as before. To switch a DTO, import
its decorators from `@meghjs/core` instead:

```ts
import { IsString, MinLength } from 'class-validator'; // [!code --]
import { Type } from 'class-transformer'; // [!code --]
import { IsString, MinLength, Type } from '@meghjs/core'; // [!code ++]
```

Error responses, the values your handler receives and the
[OpenAPI](/microservices/openapi) schema stay the same.

Switch every decorator of a DTO at once. A DTO that mixes `@meghjs/core`
decorators with class-validator or class-transformer ones fails when the app
starts, because each library would only check its own rules. Nested DTOs
(`@Type(() => AddressDto)`) must use Megh's decorators too.

Keep a DTO on class-validator if it needs something Megh does not have yet:

- custom validators: `@Validate`, `@ValidatorConstraint`, `registerDecorator`
- class-validator decorators not in the [table](#decorators)
- `@Expose`, `@Exclude`, and `@Type` with a `discriminator`
- Megh's `IsArrayNotEmpty` (use `ArrayNotEmpty` instead)

### Faster class-validator DTOs (experimental)

Apps that keep class-validator DTOs can have them validated by a function
compiled from class-validator's own rules:

```ts
const app = Megh.createApplication({
  experimental: { compiledValidation: true },
});
```

or set `MEGH_COMPILED_VALIDATION=1`. Results are the same as without it; DTOs
it cannot reproduce exactly (nested DTOs, `@Type`, `@Transform`, async
validators) are validated by class-validator as before. This option may change
in a minor release.

## Deriving DTOs

Rather than repeating fields, derive one DTO from another:

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

::: warning
The derived class copies the properties' types but not their validation rules,
for class-validator and Megh decorators alike, so it validates nothing until
this is fixed. For now, declare the rules on the derived DTO.
:::

## Extra validators

Megh adds validators on top of the class-validator set:

```ts
import { IsArrayNotEmpty } from '@meghjs/core';

export class CreateOrderDto {
  @IsArrayNotEmpty({ message: 'An order needs at least one item' })
  items: number[];
}
```

`IsArrayNotEmpty` is a class-validator decorator; in a DTO that uses Megh's
decorators, use `ArrayNotEmpty` instead.

## Validating by hand

To run a DTO's validation outside a route, use `validateDto`:

```ts
import { validateDto } from '@meghjs/core';

const { value, errors } = validateDto(CreateUserDto, input);
if (errors) {
  // [{ path: 'email', constraints: { isEmail: 'email must be an email' } }]
}
```

`value` is the DTO instance and `errors` is `null` when the input is valid,
the same shape as the 400 response's `errors`. For class-validator DTOs, use
`transformAndValidate`, which works the same but returns a promise:

```ts
import { transformAndValidate } from '@meghjs/core';

const { value, errors } = await transformAndValidate(CreateUserDto, input);
```

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
