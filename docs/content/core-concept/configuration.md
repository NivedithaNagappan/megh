---
title: Configuration and Environment
description: Reading environment variables, loading .env, and typed config classes with @AppConfig and GetConfig.
---

# Configuration and Environment

Megh reads settings from environment variables and a `.env` file. Read them
directly with `Environment`, or group them into typed config classes.

## The `.env` file

Megh loads `.env` from the current working directory (`process.cwd()`) into
`process.env` when `@meghjs/core` is first imported. Module-level code can
read `process.env` straight away.

```sh [.env]
PORT=4000
MAIL_HOST=smtp.example.com
MAIL_PORT=587
```

- Only `.env` is read. There is no `.env.local` or `.env.production`.
- A missing `.env` is fine. Nothing is loaded and no error is raised.
- Real environment variables win. A variable already set in the shell, in
  Docker or by your host is never overwritten by `.env`.
- Run the app from the project root, or the file won't be found.

### `MEGH_DOTENV`

Set `MEGH_DOTENV=false` to stop Megh loading `.env` into `process.env`, for
example when your platform injects the environment itself:

```sh
MEGH_DOTENV=false node dist/serve.js
```

It is checked before `.env` is read, so set it in the real environment, not in
`.env`.

::: warning
`MEGH_DOTENV=false` only skips the `process.env` load. `Environment` still
reads `.env` from the working directory if one exists, so `env.get()` can
return values that `process.env` doesn't have. Don't ship a `.env` file if you
rely on it not being read.
:::

## `Environment`

`Environment` is an injectable service for reading variables:

```ts [src/services/mailer.service.ts]
import { AppService, Environment, inject } from '@meghjs/core';

@AppService
export class MailerService {
  private readonly env = inject(Environment);

  host() {
    return this.env.get<string>('MAIL_HOST') ?? 'localhost';
  }
}
```

| Method | Returns |
|--------|---------|
| `get<T>(key)` | The value, or `undefined` when it isn't set |
| `getOrThrow<T>(key)` | The value. Throws `"<KEY> not found in environment variables."` when it isn't set |
| `getAll<T>()` | Every variable, `.env` merged with `process.env` |
| `Environment.reload()` | Static. Forget the cached `.env` so the next read loads it again |

Values from `process.env` take precedence over the `.env` file in all three
methods.

::: tip Values are strings
The type parameter is only a cast. `env.get<number>('PORT')` still returns the
string `"4000"`. Convert it yourself: `Number(env.get('PORT'))`.
:::

`getOrThrow` treats an empty value (`KEY=`) as set and returns `""`.

### Caching

`Environment` parses `.env` once and keeps the result. `process.env` is read on
every call, so changes to it at runtime show up straight away. Edits to the
`.env` file do not, until you call `Environment.reload()` or restart.

If `.env` exists but can't be read, the error is logged and `Environment`
returns no values at all, including those from `process.env`, until
`Environment.reload()`.

### Outside classes

`inject()` works anywhere, for example in the startup script:

```ts [src/serve.ts]
import { Environment, inject } from '@meghjs/core';
import app from './app';

async function serve() {
  const env = inject(Environment);
  if (env.get('MAINTENANCE') === 'true') return;
  await app.run();
}

serve();
```

## Config classes

A config class turns variables into one typed settings object. Extend
`MeghConfig<T>`, implement `config(env)`, and mark the class with
`@AppConfig`:

```ts [src/config/mail.config.ts]
import { AppConfig, Environment, MeghConfig } from '@meghjs/core';

export type MailSettings = {
  host: string;
  port: number;
  secure: boolean;
  from: string;
};

@AppConfig
export class MailConfig extends MeghConfig<MailSettings> {
  config(env: Environment): MailSettings {
    return {
      host: env.get('MAIL_HOST') ?? 'localhost',
      port: Number(env.get('MAIL_PORT')) || 1025,
      secure: env.get('MAIL_SECURE') === 'true',
      from: env.getOrThrow('MAIL_FROM'),
    };
  }
}
```

`npx megh make:config mail` generates this file for you.

`@AppConfig` registers the class with [dependency injection](/core-concept/dependency-injection).
It takes no arguments, so write `@AppConfig`, not `@AppConfig()`.

### Reading a config with `GetConfig`

`GetConfig(ConfigClass)` returns the object built by `config()`, typed from the
class:

```ts [src/services/mailer.service.ts]
import { AppService, GetConfig } from '@meghjs/core';
import { MailConfig } from '../config/mail.config';

@AppService
export class MailerService {
  private readonly mail = GetConfig(MailConfig); // MailSettings

  connect() {
    return createTransport({ host: this.mail.host, port: this.mail.port });
  }
}
```

`config()` runs on every `GetConfig` call. The result is not cached, so read it
once into a field rather than in a hot path.

If the class isn't registered, `GetConfig` throws
`Config class "MailConfig" is not registered. Did you forget to apply the @AppConfig decorator?`.

::: warning
That same message is shown when `config()` itself throws, for example from
`getOrThrow`. If you see it on a class that does have `@AppConfig`, check that
the variables it reads are set.
:::

### Reading a token

`GetConfig` also accepts a token or string name and returns whatever is
registered for it in the container:

```ts
import { GetConfig, MeghContainer } from '@meghjs/core';

MeghContainer.set('FEATURE_FLAGS', { newCheckout: true });

const flags = GetConfig<{ newCheckout: boolean }>('FEATURE_FLAGS');
```

It throws `Config token "FEATURE_FLAGS" is not registered in the container.`
when nothing is set.

### Passing a config class to the app

Some `use*` methods take a config class in place of options and call
`config()` for you:

```ts [src/app.ts]
import { Megh } from '@meghjs/core';
import { OpenApiConfig } from './config/openapi.config';
import { DatabaseConfig } from './config/database.config';

const app = Megh.createApplication();

app.useMeghORM(DatabaseConfig);   // MeghConfig<DatabaseOptions>
app.useOpenApi(OpenApiConfig);    // MeghConfig<OpenApiUiOptions>
```

`useMeghORM` only recognises a class that extends `MeghConfig`, so always
extend it. The config is read once, when the method is called.

## Summary

| API | Use |
|-----|-----|
| `Environment` | Injectable service: `get`, `getOrThrow`, `getAll`, `Environment.reload()` |
| `MeghConfig<T>` | Base class for config classes. Implement `config(env): T` |
| `@AppConfig` | Registers a config class for injection |
| `GetConfig(ConfigClass)` | Builds and returns the typed settings |
| `GetConfig(token)` | Returns the value registered for a token or string |
| `MEGH_DOTENV=false` | Don't load `.env` into `process.env` |

See also [Application](/getting-started/application) for `NODE_ENV`, `HOST`
and other variables the app reads, and
[Deployment](/production/deployment) for setting the environment in
production.
