<p align="center">
  <img src="resources/megh-logo.png" alt="MeghJs" width="320" />
</p>

<p align="center"><a href="README.md">English</a> | <b>বাংলা</b></p>

# Megh

![npm version](https://img.shields.io/npm/v/@meghjs/core.svg)
![CI](https://github.com/meghjs/megh/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/npm/l/@meghjs/core.svg)

Megh হলো [Fastify](https://fastify.dev)-এর ওপর তৈরি একটি TypeScript-first web framework, যা কম boilerplate দিয়ে scalable ও maintainable REST API তৈরির জন্য বানানো হয়েছে। এতে আছে decorator-based routing, built-in dependency injection, স্বয়ংক্রিয় OpenAPI documentation এবং first-class validation support।

> **আগে এর নাম ছিল Avleon।** `@avleon/*` এখন `@meghjs/*`। দেখুন
> [Moving from Avleon to Megh](https://meghjs.github.io/getting-started/upgrading-megh)।

Documentation: **https://meghjs.github.io**

> **0.2 থেকে upgrade করছেন?** 0.3-এ authorization, validation,
> pagination, file storage এবং dependency-তে breaking change আছে। দেখুন [Upgrading to 0.3](#upgrading-to-03)।

---

## সূচিপত্র

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [মূল ধারণা](#মূল-ধারণা)
  - [Application](#application)
  - [Controllers](#controllers)
  - [Route Methods](#route-methods)
  - [Parameter Decorators](#parameter-decorators)
  - [Error Handling](#error-handling)
  - [Middleware](#middleware)
  - [Authentication](#authentication)
  - [Authorization](#authorization)
  - [Validation](#validation)
  - [Configuration](#configuration)
  - [Logging](#logging)
  - [OpenAPI Documentation](#openapi-documentation)
- [Advanced Features](#advanced-features)
  - [MeghORM](#meghorm)
  - [Database](#database)
  - [Pagination](#pagination)
  - [Events](#events)
  - [Queues & Workers](#queues--workers)
  - [Task Scheduling](#task-scheduling)
  - [Caching](#caching)
  - [File Uploads](#file-uploads)
  - [Static Files](#static-files)
  - [WebSocket (Socket.IO)](#websocket-socketio)
- [Route Mapping (Functional Style)](#route-mapping-functional-style)
- [Testing](#testing)
- [Production](#production)
- [Upgrading to 0.3](#upgrading-to-03)
- [Known Issues in 0.3.0](#known-issues-in-030)
- [Roadmap to 1.0.0](#roadmap-to-100)
- [Repository-র গঠন](#repository-র-গঠন)
- [Megh-এ কাজ করা](#megh-এ-কাজ-করা)
- [Publishing ও deployment](#publishing-ও-deployment)
- [Release ও versioning](#release-ও-versioning)
- [নিরাপত্তা](#নিরাপত্তা)
- [License](#license)

---

## Features

- 🎯 **Decorator-based routing** — TypeScript decorator দিয়ে controller ও route তৈরি করুন
- 💉 **Dependency injection** — `MeghContainer`, `@Injectable` এবং `Token`, Megh-এর নিজস্ব container-এর ওপর ভিত্তি করে (কোনো third-party DI library ছাড়া)
- 📄 **OpenAPI / Swagger** — Swagger UI বা [Scalar](https://scalar.com) দিয়ে স্বয়ংক্রিয় documentation
- ✅ **Validation** — [class-validator](https://github.com/typestack/class-validator) দিয়ে request DTO validate ও whitelist করা হয়
- 🔑 **Authentication** — pluggable handler, যা `request.user` সেট করে
- 🔒 **Authorization** — deny-by-default `@Authorized` route
- 📁 **File uploads** — নিরাপদ, সীমাবদ্ধ storage-সহ multipart support
- 🧬 **Models & migrations** — decorator model, query builder এবং migration-এর জন্য schema builder, সবই type-safe
- 🗄️ **Database** — একই pagination কাঠামোসহ TypeORM ও Knex integration
- ⚙️ **Config** — typed, environment-aware config class
- 📣 **Events** — queue-based delivery ও Socket.IO broadcast-সহ typed event
- 📬 **Queues & workers** — [BullMQ](https://docs.bullmq.io)-এ background job, test-এর জন্য in-memory driver-সহ
- ⏰ **Task scheduling** — cron, interval ও timeout job
- 🗃️ **Caching** — in-memory বা Redis, TTL ও tag-based invalidation-সহ
- 📝 **Logging** — [pino](https://getpino.io) দিয়ে structured JSON log
- 🔌 **WebSocket** — Socket.IO integration
- 🧪 **Testing** — built-in test utility

---

## Installation

Megh চালাতে **Node.js 22 বা তার নতুন version** লাগবে।

CLI দিয়ে একটি নতুন project তৈরি করুন:

```bash
npx @meghjs/cli new myapp
# or
yarn dlx @meghjs/cli new myapp
# or
pnpm dlx @meghjs/cli new myapp
```

অথবা নিজে install করুন:

```bash
npm install @meghjs/core reflect-metadata class-validator class-transformer
```

`class-validator` ও `class-transformer` optional peer হিসেবে ঘোষিত, কিন্তু
package-টি load হওয়ার সময়ই এগুলো import করে, তাই প্রতিটি project-এ এগুলো install করুন।

`tsconfig.json`-এ decorator চালু করুন:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### Optional dependencies

Megh integration-গুলোকে মূল install-এর বাইরে রাখে। শুধু যা ব্যবহার করবেন সেটাই যোগ করুন।
এগুলোর কোনোটি ছাড়াই package-টি ঠিকঠাক import হয়, আর কোনো feature-এর যখন এগুলোর একটি দরকার হয়,
তখন আপনি একটি স্পষ্ট error পাবেন:

| Feature                                      | Install                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| CORS (`useCors`)                             | `npm i @fastify/cors`                                                                |
| File uploads (`useMultipart`, `@UploadFile`) | `npm i @fastify/multipart`                                                           |
| Static files (`useStaticFiles`)              | `npm i @fastify/static`                                                              |
| OpenAPI with Swagger UI                      | `npm i @fastify/swagger @fastify/swagger-ui`                                         |
| OpenAPI with Scalar                          | `npm i @fastify/swagger @scalar/fastify-api-reference`                               |
| MeghORM (`useMeghORM`)                       | একটি driver (`pg`, `mysql2`, `better-sqlite3`, বা `tedious tarn`)                    |
| TypeORM                                      | `npm i typeorm` + একটি driver (`pg`, `mysql2`, `sqlite3`, `better-sqlite3`, `mssql`) |
| Knex                                         | `npm i knex` + একটি driver                                                           |
| Queues & workers                             | `npm i bullmq ioredis` (`memory`/`sync` driver-এ দরকার নেই)                          |
| Redis cache                                  | `npm i ioredis`                                                                      |
| WebSocket                                    | `npm i socket.io fastify-socket.io`                                                  |
| `FileStorage`-এ image transform              | `npm i sharp`                                                                        |
| সুন্দরভাবে format করা dev log                | `npm i -D pino-pretty`                                                               |

### Module format

`@meghjs/core` একটিমাত্র CommonJS build দেয়। ESM project-ও
`import { ... } from '@meghjs/core'` ব্যবহার করতে পারে। শুধু package root export করা হয়:
`@meghjs/core/dist/...`-এর মতো deep import সমর্থিত নয়।

---

## Quick Start

### Minimal (functional style)

```typescript
import { Megh } from "@meghjs/core";

const app = Megh.createApplication();

app.mapGet("/", () => ({ message: "Hello, Megh!" }));

app.run(4000);
```

### Controller style

```typescript
import { Megh, ApiController, Get } from "@meghjs/core";

@ApiController("/")
class HelloController {
  @Get()
  sayHello() {
    return { message: "Hello, Megh!" };
  }
}

const app = Megh.createApplication();
app.useControllers([HelloController]);
app.run(4000);
```

---

## মূল ধারণা

### Application

```typescript
import { Megh } from "@meghjs/core";

const app = Megh.createApplication();

app.useCors({ origin: "*" }); // requires @fastify/cors
app.useControllers([UserController]);
// Auto-discover controllers from a directory:
// app.useControllers({ auto: true, path: 'src/controllers' });

app.run(4000);
```

`app.isDevelopment()` শুধু তখনই true হয় যখন `NODE_ENV=development`। সেট না করা
`NODE_ENV` production হিসেবে ধরা হয়।

---

### Controllers

```typescript
import { ApiController, Get, Post, Put, Delete } from '@meghjs/core';

@ApiController('/users')
class UserController {
  @Get('/')
  getAll() { ... }

  @Post('/')
  create() { ... }

  @Put('/:id')
  update() { ... }

  @Delete('/:id')
  remove() { ... }
}
```

---

### Route Methods

| Decorator        | HTTP method |
| ---------------- | ----------- |
| `@Get(path?)`    | GET         |
| `@Post(path?)`   | POST        |
| `@Put(path?)`    | PUT         |
| `@Patch(path?)`  | PATCH       |
| `@Delete(path?)` | DELETE      |

---

### Parameter Decorators

```typescript
@Get('/:id')
async getUser(
  @Param('id')             id: string,
  @Query('include')        include: string,
  @Query()                 query: UserQuery,   // maps full query to a DTO
  @Body()                  body: CreateUserDto,
  @Header('authorization') token: string,
  @AuthUser()              user: CurrentUser,
) {
  // ...
}
```

| Decorator       | উৎস                        |
| --------------- | -------------------------- |
| `@Param(key?)`  | route path-এর parameter    |
| `@Query(key?)`  | query string               |
| `@Body()`       | request body               |
| `@Header(key?)` | request header             |
| `@AuthUser()`   | বর্তমান authenticated user |

আপনি যদি tsx, esbuild বা SWC দিয়ে compile করেন, তাহলে compiler decorator
metadata তৈরি করে না। Validation যেন তবুও চলে, সেজন্য DTO type-টি স্পষ্টভাবে পাস করুন:

```typescript
create(@Body({ type: CreateUserDto }) body: CreateUserDto) { ... }
```

---

### Error Handling

200 ছাড়া অন্য কোনো response পাঠাতে একটি `HttpExceptions` error throw করুন:

```typescript
import { HttpExceptions } from '@meghjs/core';

@Get('/:id')
async getUser(@Param('id') id: string) {
  const user = await this.userService.findById(id);

  if (!user) {
    throw HttpExceptions.notFound('User not found');
  }

  return user;
}
```

যেসব exception আছে: `badRequest` (400), `unauthorized` (401), `forbidden` (403),
`notFound` (404), `validationError` এবং `internalError` (500)।

Error response-এর গঠন হলো `{ code, status: "Error", message, data? }`।
Development ছাড়া অন্য environment-এ 5xx response message ও data লুকিয়ে রাখে এবং
`"Internal Server Error"` return করে।

---

### Middleware

```typescript
import { AppMiddleware, MeghMiddleware, IRequest } from "@meghjs/core";

@AppMiddleware
class LoggingMiddleware extends MeghMiddleware {
  async invoke(req: IRequest) {
    console.log(`${req.method} ${req.url}`);
    return req;
  }
}

// Apply to every request
app.useMiddlewares([LoggingMiddleware]);
```

`@UseMiddleware` দিয়ে middleware-কে একটি controller বা route-এর মধ্যে সীমাবদ্ধ করুন। Class
DI-এর মাধ্যমে resolve হয়, তাই constructor injection ব্যবহার করা যায়। Instance-ও কাজ করে:

```typescript
// Apply to entire controller
@UseMiddleware(LoggingMiddleware)
@ApiController('/users')
class UserController { ... }

// Or apply to a specific route
@ApiController('/users')
class UserController {
  @UseMiddleware([LoggingMiddleware, new RateLimitMiddleware(100)])
  @Get('/')
  getAll() { ... }
}
```

Request-গুলো ক্রমানুসারে এই ধাপগুলোর মধ্য দিয়ে যায়:

1. Global middleware (`useMiddlewares`)
2. Authentication
3. Class-এর `@Authorized`, তারপর method-এর `@Authorized`
4. Class-এর `@UseMiddleware`, তারপর method-এর `@UseMiddleware`
5. Parameter validation
6. Handler

---

### Authentication

Authentication ঠিক করে caller _কে_। একটি handler register করুন; সেটি যা
return করে তা-ই `request.user` হয়, এবং `@AuthUser()` এই মানটিই inject করে।

**1 — আপনার authentication class লিখুন:**

```typescript
import { MeghAuthentication, AppService, IRequest } from "@meghjs/core";

@AppService
export class JwtAuthentication extends MeghAuthentication<User> {
  async authenticate(request: IRequest) {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return null;
    return verifyToken(header.slice(7)); // becomes request.user
  }
}
```

**2 — App-এ register করুন:**

```typescript
app.useAuthentication(JwtAuthentication);
```

**3 — যেকোনো controller-এ user পড়ুন:**

```typescript
@ApiController("/me")
class MeController {
  @Get()
  whoami(@AuthUser() user: User) {
    return user;
  }
}
```

`null` return করলে `request.user` সেট হয় না। Authentication শুধু caller-কে শনাক্ত
করে; anonymous request প্রত্যাখ্যান করা authorization-এর কাজ।

---

### Authorization

Authorization **deny-by-default**। `@Authorized` চিহ্নিত কোনো route
**403** দেয়, যদি না একটি authorizer register করা থাকে এবং সেটি request-টি অনুমোদন করে।

**1 — আপনার authorization class লিখুন।** নিষেধ করতে `false` (→ 403) return করুন অথবা একটি
`HttpExceptions` error throw করুন। অন্য যেকোনো return মান request-টি অনুমোদন করে:

```typescript
import { CanAuthorize, IRequest, HttpExceptions } from "@meghjs/core";

@CanAuthorize
class JwtAuthorization {
  async authorize(req: IRequest, options?: { roles?: string[] }) {
    if (!req.user) throw HttpExceptions.unauthorized("Login required");
    if (options?.roles && !options.roles.includes(req.user.role)) return false;
  }
}
```

**2 — App-এ register করুন:**

```typescript
app.useAuthorization(JwtAuthorization);

// or register several by name, and pick one with @Authorized('jwt')
app.useAuthorization({ jwt: JwtAuthorization, apiKey: ApiKeyAuthorization });
```

**3 — Controller বা route সুরক্ষিত করুন:**

```typescript
// Protect entire controller
@Authorized()
@ApiController('/admin')
class AdminController {
  @Get('/')
  dashboard(@AuthUser() user: User) {
    return user;
  }
}

// Protect specific route with roles
@ApiController('/admin')
class AdminController {
  @Authorized({ roles: ['admin'] })
  @Get('/stats')
  stats() { ... }
}
```

কোনো authorizer register করা না থাকলে Megh boot-এর সময় একটি warning log করে এবং প্রতিটি
`@Authorized` route 403 return করে। যে নামে কোনো handler register করা নেই, সেই নামে `@Authorized('name')`
ব্যবহার করলে `app.run()` ব্যর্থ হয়।

---

### Validation

Validation চালায় `class-validator`। আপনার DTO-তে decorator যোগ করুন, আর Megh স্বয়ংক্রিয়ভাবে `@Body()` ও `@Query()` validate করবে:

```typescript
import { IsString, IsNotEmpty, IsEmail, IsInt, Min, Max, IsOptional } from 'class-validator';

class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsInt()
  @Min(0)
  @Max(120)
  age: number;

  @IsOptional()
  @IsString()
  role?: string;
}

@Post('/')
async createUser(@Body() body: CreateUserDto) {
  return this.userService.create(body); // body is a CreateUserDto instance
}
```

- Handler **transform করা DTO instance** পায়, তাই `class-transformer`
  decorator যেমন `@Type(() => Number)` কাজ করে।
- DTO-তে ঘোষণা করা হয়নি এমন property **প্রত্যাখ্যাত** হয় (`whitelist` +
  `forbidNonWhitelisted`), যা mass assignment ঠেকায়।

Validation ব্যর্থ হলে **400** return করে:

```json
{
  "code": 400,
  "status": "Error",
  "message": "email must be an email",
  "errors": [
    { "path": "email", "constraints": { "isEmail": "email must be an email" } }
  ]
}
```

Nested error-গুলো dotted path ব্যবহার করে (`address.city`)।

একই নিয়মে কোনো মান নিজে validate করতে
`transformAndValidate(Dto, value)` call করুন। এটি `{ value, errors }` return করে।

---

### Configuration

Config class environment variable-গুলোকে typed, inject করা যায় এমন setting-এ রূপান্তর করে।
`MeghConfig` extend করুন এবং `@AppConfig` দিয়ে register করুন:

```typescript
import { AppConfig, MeghConfig, Environment, GetConfig } from "@meghjs/core";

type MailSettings = { host: string; port: number };

@AppConfig
export class MailConfig extends MeghConfig<MailSettings> {
  config(env: Environment): MailSettings {
    return {
      host: env.get("MAIL_HOST") || "localhost",
      port: Number(env.get("MAIL_PORT")) || 1025,
    };
  }
}

const mail = GetConfig(MailConfig); // MailSettings
```

একটি config class-কে অবশ্যই `extend MeghConfig` করতে হবে। `useKnex`, `useTypeORM` বা `useOpenApi`-তে
কোনো config class পাস করলে Megh এভাবেই সেটিকে চিনতে পারে।

---

### Logging

`LoggerService` হলো [pino](https://getpino.io)-এর একটি wrapper। Default-ভাবে এটি structured JSON
লেখে, আর শুধু তখনই সুন্দরভাবে format করা output দেয় যখন `NODE_ENV=development` থাকে এবং `pino-pretty`
install করা থাকে। Framework-এর log (event, queue, worker, scheduler) একই logger-এর
মাধ্যমে যায়।

```typescript
import { AppService, LoggerService } from "@meghjs/core";

@AppService
export class OrdersService {
  constructor(private readonly logger: LoggerService) {}

  place(order: Order) {
    this.logger.info("order placed", { orderId: order.id });
  }
}

LoggerService.configure({ level: "debug" });
const log = LoggerService.child({ module: "billing" });
```

Megh এই logger Fastify-কে দেয় না। একটিই pino instance share করতে চাইলে সেটি
স্পষ্টভাবে পাস করুন: `LoggerService.getPino()`।

---

### OpenAPI Documentation

প্রথমে আপনার পছন্দের UI install করুন: `@fastify/swagger`-এর সাথে `@fastify/swagger-ui`,
অথবা Scalar-এর জন্য `@scalar/fastify-api-reference`।

**Inline config:**

```typescript
app.useOpenApi({
  info: {
    title: "User API",
    version: "1.0.0",
    description: "API for managing users",
  },
  servers: [{ url: "http://localhost:4000", description: "Dev server" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
});
```

**Config class:**

```typescript
import {
  AppConfig,
  MeghConfig,
  Environment,
  OpenApiUiOptions,
} from "@meghjs/core";

@AppConfig
export class OpenApiConfig extends MeghConfig<OpenApiUiOptions> {
  config(env: Environment): OpenApiUiOptions {
    return {
      info: { title: "My API", version: "1.0.0" },
      routePrefix: "/docs",
      provider: "scalar", // or 'default' for Swagger UI
      auth: "bearer", // marks @Authorized routes, for the "Authorize" button
    };
  }
}

// In app.ts. Only active when NODE_ENV=development.
if (app.isDevelopment()) {
  app.useOpenApi(OpenApiConfig);
}
```

**`@OpenApi` দিয়ে route-level documentation:**

```typescript
import { ApiResponse, Authorized, OpenApi, OpenApiProperty, OpenApiSchema, Paginated } from '@meghjs/core';

@OpenApiSchema()
export class UserQuery {
  @OpenApiProperty({ type: 'string', example: 'john', required: false })
  @IsOptional()
  search?: string;

  @OpenApiProperty({ type: 'integer', example: 1, required: false })
  @IsOptional()
  page?: number;
}

@OpenApi({ summary: 'Get all users', tags: ['users'] })
@ApiResponse(200, Paginated(User)) // a MeghORM model or a DTO: { data: User[], meta }
@Authorized() // documents 401 and 403
@Get('/')
getAll(@Query() query: UserQuery) { ... } // the DTO documents the query and a 400
```

Schema শুধু decorate করা property থেকেই তৈরি হয়, আর nested DTO-গুলো
`components.schemas`-এর অধীনে `$ref` হয়ে যায়।

---

## Advanced Features

### MeghORM

Megh-এর নিজস্ব ORM: decorator model এবং query builder; column-এর নাম, মানের
type এবং load করা relation TypeScript দিয়ে যাচাই করা হয়। ভেতরে Kysely চলে,
সেটি আপনাকে set up করতে হয় না।

```bash
npm install pg   # or: mysql2, better-sqlite3, tedious tarn
```

```typescript
import {
  DB,
  Model,
  Table,
  PrimaryKey,
  AutoIncrement,
  Column,
  CreatedAt,
  HasMany,
} from "@meghjs/core";
import { Post } from "./post.model";

@Table("users")
export class User extends Model {
  @PrimaryKey() @AutoIncrement() id?: number;
  @Column({ unique: true }) email!: string;
  @Column({ nullable: true }) name!: string | null;
  @CreatedAt() createdAt?: Date;

  @HasMany(() => Post) posts!: HasMany<Post>;
}

// app.ts: no Kysely setup, no connection file
app.useMeghORM(); // reads DATABASE_URL, or pass { dialect, host, ... }

const users = await User.where("email", "like", "%@acme.io")
  .with("posts")
  .orderBy("name")
  .get();

// or as a query builder
const ids = await DB.table("users").where("active", true).pluck("id");
```

Migration-গুলো `src/database/migrations`-এ থাকে এবং CLI দিয়ে চালানো হয়:

```bash
npx megh make:migration create_users_table
npx megh migrate
```

Seeder database-এ data ভরে, আর factory [Faker](https://fakerjs.dev) দিয়ে
fake value-সহ row বানায়:

```bash
npx megh make:factory user      # UserFactory, প্রতিটি column-এ একটি Faker value
npx megh make:seeder users      # await UserFactory.createMany(10)
npx megh migrate --seed         # অথবা: npx megh db:seed
```

Relation, timestamp, soft delete, cast, transaction, migration, seeding এবং
factory [MeghORM guide](https://meghjs.github.io/advanced/orm)-এ বিস্তারিত আছে।

অথবা template থেকে পুরো table, feature এবং business domain scaffold করুন:

```bash
npx megh sc:auth --strategy jwt --roles multiple --permissions   # sign-up, sign-in, role
npx megh sc:domain ecommerce --resource                          # product, order, payment, ...
npx megh make:resource Ticket --fields "title,body,status:in(open|closed),user_id:cascade"
```

Template, field, domain, auth এবং RBAC [Scaffold](https://meghjs.github.io/cli/scaffold/)-এ বিস্তারিত আছে।

---

### Database

TypeORM এবং Knex support [`@meghjs/data`](https://github.com/meghjs/megh/tree/main/packages/data) নামের একটি plugin-এ আছে:
এটি install করলে `app.useTypeORM()` / `app.useKnex()` ব্যবহার করা যায়।

```bash
npm install @meghjs/data typeorm pg   # or: knex pg
```

---

### Pagination

প্রতিটি paginator (`Collection`, `@InjectRepository`, `MeghRepository`,
`KnexDB`) `{ page, perPage }` নেয় এবং একই কাঠামো return করে:

```json
{
  "data": [ ... ],
  "meta": { "total": 57, "page": 2, "perPage": 20, "lastPage": 3, "next": 3, "prev": 1 }
}
```

`page`-এর default মান 1 এবং `perPage`-এর default মান 10। `Paginated<T>` এবং `PageRequest`
type-গুলো export করা হয়।

---

### Events

```typescript
import {
  MeghEvent,
  MeghEventListener,
  EventRegistry,
  EventDispatcher,
} from "@meghjs/core";

class UserCreated extends MeghEvent<{ userId: number }> {}

class SendWelcome extends MeghEventListener<UserCreated> {
  async handler(event: UserCreated) {
    await mailer.welcome(event.payload.userId);
  }
}

EventRegistry.getInstance().register(UserCreated, new SendWelcome());

const dispatcher = new EventDispatcher();
await dispatcher.dispatch(new UserCreated({ userId: 1 }));

// queued, delayed and retried
await dispatcher.dispatch(new UserCreated({ userId: 1 }), {
  queue: true,
  delay: "5s",
  retry: 3,
  retryDelay: 500,
});

// also broadcast over Socket.IO (requires app.useSocketIo())
await dispatcher.dispatch(new UserCreated({ userId: 1 }), {
  broadcast: { type: "socket", channel: "users", room: "admins" },
});
```

- Listener-গুলো event class অনুযায়ী register হয়।
- `once` listener ঠিক একবারই চলে, এমনকি একসাথে একাধিক dispatch হলেও।
- Queue-তে থাকা যে job-গুলো বারবার ব্যর্থ হয় সেগুলো
  `EventQueue.getInstance().getFailedJobs()`-এ রাখা থাকে।
- Kafka এবং RabbitMQ broadcast 0.3-এ implement করা হয়নি, এবং এগুলো ব্যবহার করলে
  error throw হয়।

---

### Queues & Workers

Background job [BullMQ](https://docs.bullmq.io)-এর ওপর চলে। একটি
Redis client-এর সাথে এটি install করুন:

```bash
npm i bullmq ioredis
```

একটি queue job তৈরি এবং process দুটোই করে। প্রতিটি job-এর নাম `@JobHandler` দিয়ে দিন।
0.3.0-এ class-টিতে একটি স্পষ্ট constructor লাগবে যা `super()` call করে (দেখুন
[known issues](#known-issues-in-030)):

```typescript
import { MeghQueue, Queue, JobHandler, Job } from "@meghjs/core";

type EmailPayload = { userId: number; email: string };

@Queue({
  name: "email",
  adapter: { connection: { host: "127.0.0.1", port: 6379 } },
  worker: { concurrency: 5 },
})
export class EmailQueue extends MeghQueue<EmailPayload> {
  constructor() {
    super();
  }

  @JobHandler("welcome")
  async sendWelcome(job: Job<EmailPayload>) {
    await mailer.send(job.data.email, "Welcome!");
  }

  @JobHandler("reminder")
  async sendReminder(job: Job<EmailPayload>) {
    await mailer.send(job.data.email, "Don't forget…");
  }
}
```

যেখানেই queue-টি inject করা হয়েছে, সেখান থেকে job dispatch করুন:

```typescript
@AppService
export class UsersService {
  constructor(private readonly emails: EmailQueue) {}

  async register(user: User) {
    await this.emails.dispatch("welcome", {
      userId: user.id,
      email: user.email,
    });
    await this.emails.dispatch(
      "reminder",
      { userId: user.id, email: user.email },
      86_400_000,
    );
  }
}
```

Base class-এ ঘোষিত handler-গুলো inherit হয়, এবং একটি subclass একই job-এর নাম
আবার ব্যবহার করে যেকোনো handler override করতে পারে।

**Producer-only queue।** অন্য কোনো process job-গুলো process করলে `worker: false`
পাস করুন। এতে কোনো worker চালু হয় না:

```typescript
@Queue({ name: "reports", worker: false })
export class ReportProducer extends MeghQueue<ReportPayload> {
  constructor() {
    super();
  }
}
```

**Standalone worker।** Consumer যখন নিজস্ব process-এ চলে, তখন
`MeghWorkerBase` ব্যবহার করুন:

```typescript
import { MeghWorker, MeghWorkerBase, Job } from "@meghjs/core";

@MeghWorker({ queue: "email", concurrency: 5 })
export class EmailWorker extends MeghWorkerBase<EmailPayload> {
  async process(job: Job<EmailPayload>) {
    await mailer.send(job.data.email, "Welcome!");
  }

  onFailed(job: Job<EmailPayload> | undefined, error: Error) {
    logger.error(`Job ${job?.id} failed`, error);
  }
}
```

Queue ও worker-গুলো register করুন, যাতে সেগুলো app-এর সাথে চালু হয় এবং shutdown-এর সময় বন্ধ হয়।
শুধু worker class-এ decorator দিলেই এটি আর চালু হয় না:

```typescript
app.useWorker([EmailQueue, EmailWorker]);
```

**In-memory driver।** Test ও local development-এ Redis ছাড়াই queue চালান।
`memory` job-গুলো asynchronously চালায় এবং `delay` মেনে চলে। `sync` প্রতিটি job
`add()` resolve হওয়ার আগেই চালায়:

```typescript
import {
  setQueueDriver,
  waitForMemoryQueues,
  resetMemoryQueues,
} from "@meghjs/core";

setQueueDriver("memory"); // or MEGH_QUEUE_DRIVER=memory, or @Queue({ driver: 'memory' })

await usersService.register(user);
await waitForMemoryQueues(); // wait until all jobs finish
resetMemoryQueues();
```

---

### Task Scheduling

একটি class-কে `@ScheduledTask()` দিয়ে চিহ্নিত করুন, তারপর এর method-গুলো schedule করুন:

```typescript
import { ScheduledTask, Cron, Interval, Timeout } from '@meghjs/core';

@ScheduledTask()
export class ReportTask {
  constructor(private readonly reports: ReportService) {}

  @Cron('0 8 * * 1-5', { timezone: 'Asia/Dhaka' })
  async sendDailyReport() {
    await this.reports.send();
  }

  @Interval(60_000)          // every minute
  async pollQueue() { ... }

  @Timeout(5_000)            // once, 5s after startup
  async warmCache() { ... }
}
```

Schedule করা method-গুলো inherit হয়, এবং একটি subclass প্রতিটি method আলাদাভাবে
override করতে পারে।

Task-গুলো সরাসরি register করুন, অথবা স্বয়ংক্রিয়ভাবে খুঁজে নিতে দিন:

```typescript
app.useScheduler([ReportTask]);
// or
app.useScheduler({ path: "src/tasks" });
```

---

### Caching

Default-ভাবে in-memory; এর বদলে Redis ব্যবহার করতে `provider: 'redis'` দিন।

```typescript
app.useCache({ provider: "memory" });

// Redis (requires: npm i ioredis)
app.useCache({
  provider: "redis",
  redisOptions: { host: "127.0.0.1", port: 6379 },
});
```

যেখানে দরকার সেখানে `CacheManager` inject করুন। Entry-গুলোতে tag থাকতে পারে, ফলে সম্পর্কিত
key-গুলো একসাথে invalidate হয়:

```typescript
import { CacheManager, AppService } from "@meghjs/core";

@AppService
export class UsersService {
  constructor(private readonly cache: CacheManager) {}

  async findAll() {
    const cached = await this.cache.get<User[]>("users:all");
    if (cached) return cached;

    const users = await this.repo.find();
    await this.cache.set("users:all", users, 3600, ["users"]);
    return users;
  }

  async update(user: User) {
    await this.repo.save(user);
    await this.cache.invalidateTags("users");
  }
}
```

TTL সেকেন্ডে হিসাব করা হয়; `0` বা তার কম মানে মেয়াদ শেষ হবে না। Memory store মেয়াদোত্তীর্ণ
entry-গুলো read করার সময় এবং একটি background sweep-এ মুছে ফেলে, default-ভাবে প্রতি 60 s পরপর। এর
কোনো size limit নেই। প্রতিটি `new CacheManager()`-এর নিজস্ব store থাকে; `useCache` দিয়ে
register করা instance-টি DI-এর মাধ্যমে share করা হয়।

---

### File Uploads

```typescript
// Configure multipart support (requires @fastify/multipart)
app.useMultipart({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});
```

`useMultipart()` তার option-গুলো `@fastify/multipart`-এ পাঠায়। Megh
`attachFieldsToBody: true` (`@UploadFile`-এর জন্য দরকার) এবং প্রতি file-এ
**10 MB** limit সেট করে, যদি না আপনি নিজের `limits` দেন। এই limit আর
`FileStorage`-এর `maxFileSize` (50 MB)-এর মধ্যে যেটা ছোট সেটাই কাজ করে, তাই
বড় file-এর জন্য দুটোই বাড়ান।

```typescript
import {
  ApiController,
  Post,
  FileStorage,
  UploadFile,
  MultipartFile,
  OpenApi,
} from "@meghjs/core";

@ApiController("/files")
class FileController {
  constructor(private readonly fileStorage: FileStorage) {}

  @OpenApi({
    description: "Upload a single file",
    requestBody: {
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: { file: { type: "string", format: "binary" } },
            required: ["file"],
          },
        },
      },
    },
  })
  @Post("/upload")
  async upload(@UploadFile("file") file: MultipartFile) {
    return this.fileStorage.save(file, { to: "avatars" });
    // { filename, originalFilename, size, uploadPath, staticPath }
  }
}
```

`FileStorage` default-ভাবে নিরাপদ:

- Save করা file-গুলো extension বজায় রেখে একটি **random UUID নাম** পায়। নাম বেছে নিতে
  `saveAs: 'name.jpg'` অথবা `preserveFilename: true` দিন।
- `overwrite`-এর default মান `false`।
- শুধু প্রচলিত নিরাপদ extension-গুলো গ্রহণ করা হয়। HTML, SVG এবং JS প্রত্যাখ্যান করা হয়।
- Default size limit 50 MB, যা streaming চলাকালীন প্রয়োগ করা হয়।
- `to`, `download`, `downloadAs`, `getUploadFile` এবং `remove`-সহ প্রতিটি path
  `baseDir`-এর মধ্যে সীমাবদ্ধ। File না পাওয়া গেলে 404 দেয়।

Default-গুলো একবার configure করুন, অথবা প্রতিটি call-এ override করুন:

```typescript
storage.configure({
  baseDir: "public/uploads", // default: <cwd>/public
  allowedMimeTypes: ["image/*"],
  maxFileSize: 5_000_000,
});

await storage.save(file, {
  to: "avatars",
  transform: { resize: { width: 256, height: 256 }, format: "webp" }, // requires sharp
});
```

---

### Static Files

```typescript
import path from "path";

// requires @fastify/static
app.useStaticFiles({
  root: path.join(process.cwd(), "public"),
  prefix: "/static/",
});
```

---

### WebSocket (Socket.IO)

```typescript
// requires socket.io and fastify-socket.io
app.useSocketIo({ cors: { origin: "*" } });
```

`SocketEventDispatcher` দিয়ে client-দের কাছে event push করুন:

```typescript
import { AppService, SocketEventDispatcher } from "@meghjs/core";

@AppService
export class UserService {
  constructor(private readonly socket: SocketEventDispatcher) {}

  async create(data: any) {
    const user = await this.save(data);
    await this.socket.dispatch("users:created", { userId: user.id });
    return user;
  }
}
```

আপনি একটি domain event-ও broadcast করতে পারেন; দেখুন [Events](#events)।

---

## Route Mapping (Functional Style)

Controller class ছাড়া সাধারণ route-এর জন্য:

```typescript
app.mapGet("/users", async (req, res) => {
  return { users: [] };
});

app.mapPost("/users", async (req, res) => {
  return { success: true };
});

app.mapPut("/users/:id", async (req, res) => {
  return { success: true };
});

app.mapDelete("/users/:id", async (req, res) => {
  return { success: true };
});
```

Functional route-এ middleware এবং OpenAPI documentation যোগ করুন:

```typescript
app
  .mapGet("/users", async (req, res) => {
    return { users: [] };
  })
  .useMiddleware([AuthMiddleware])
  .useOpenApi({
    summary: "Get all users",
    tags: ["users"],
    security: [{ bearerAuth: [] }],
    response: {
      200: {
        description: "List of users",
        type: "array",
      },
    },
  });
```

Functional route-এ authentication, `@Authorized` check বা DTO
validation চলে না।

---

## Testing

Dependency inject করা অবস্থায় সরাসরি একটি controller resolve করুন:

```typescript
import { MeghTest } from "@meghjs/core";
import { UserController } from "./user.controller";

describe("UserController", () => {
  let controller: UserController;

  beforeAll(() => {
    controller = MeghTest.getController(UserController);
  });

  afterAll(() => MeghTest.clean());

  it("should return users", async () => {
    const result = await controller.getAll();
    expect(Array.isArray(result)).toBe(true);
  });
});
```

অথবা কোনো port bind না করেই আসল route-গুলো চালিয়ে দেখুন:

```typescript
const app = MeghTest.createTestApplication({ controllers: [UserController] });

const res = await app.get("/users");
expect(res.statusCode).toBe(200);

const invalid = await app.post("/users", { payload: { unknown: true } });
expect(invalid.statusCode).toBe(400);
```

`get`, `post`, `put`, `patch`, `delete` এবং `options` সবগুলোই আছে, প্রতিটি
Fastify-এর inject option (`payload`, `headers`, `query`, …) নেয়।

কোনো controller-এর দরকার হলে stub dependency-গুলো positionally পাস করুন:

```typescript
const controller = MeghTest.getController(UserController, [mockUserService]);
```

Redis ছাড়াই job dispatch করে এমন code test করতে `memory` বা `sync` [queue driver](#queues--workers)
ব্যবহার করুন।

---

## Production

- `NODE_ENV=production` সেট করুন। সেট না থাকলেও production হিসেবে ধরা হয়, তবে স্পষ্টভাবে সেট করাই ভালো।
  Production mode-এ 5xx-এর বিস্তারিত লুকানো থাকে, JSON log লেখা হয়, এবং
  `app.isDevelopment()` false হয়।
- `app.run(port)`-এর default port হলো `PORT`, না থাকলে 4000। এটি `SIGTERM`/`SIGINT` handle করে,
  বন্ধ হওয়ার আগে scheduler থামিয়ে এবং register করা worker-গুলো বন্ধ করে।
- `@Authorized` ব্যবহার করলে একটি authorizer register করুন; সেটি না থাকলে ওই route-গুলো
  403 return করে।

---

## Upgrading to 0.3

| Area          | পরিবর্তন                                                                                                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dependencies  | `@fastify/cors`, `@fastify/multipart`, `@fastify/static`, `@fastify/swagger`, `@fastify/swagger-ui`, `@scalar/fastify-api-reference`, `fastify-socket.io`, `class-validator`, `class-transformer` এবং `pino-pretty` এখন peer dependency। আপনি যেগুলো ব্যবহার করেন সেগুলো install করুন ([table](#optional-dependencies))। |
| Package       | শুধু CommonJS, একটি `exports` map-সহ। Deep import (`@meghjs/core/dist/...`) আর resolve হয় না। License এখন MIT।                                                                                                                                                                                                          |
| Environment   | `isDevelopment()`-এর জন্য `NODE_ENV=development` লাগে; সেট না থাকলে এখন production বোঝায়।                                                                                                                                                                                                                               |
| Authorization | `@Authorized` deny-by-default। যে authorizer `false` return করে, সেটি এখন access নিষেধ করে। `AuthorizeMiddleware`, `AppAuthorization`, `AuthHandler` এবং `AuthReturnTypes` সরিয়ে ফেলা হয়েছে। একটি `authorize()` method-সহ সাধারণ `@CanAuthorize` class ব্যবহার করুন।                                                   |
| Validation    | অজানা DTO property 400 দিয়ে প্রত্যাখ্যান করা হয়। Handler-গুলো DTO instance পায়। Error body এখন `{ code, status, message, errors[] }` (আগে ছিল `{ code, error: "ValidationError", errors }`)।                                                                                                                          |
| Pagination    | সব paginator `{ data, meta: { total, page, perPage, lastPage, next, prev } }` return করে এবং `{ page, perPage }` নেয়।                                                                                                                                                                                                   |
| File storage  | Default-ভাবে random filename, `overwrite: false`, extension allowlist এবং 50 MB limit। `save` option-এ `saveAs` ব্যবহার হয় (`as` নয়)। `download`/`downloadAs`/`getUploadFile` path-গুলো `baseDir` থেকে resolve করে। `UploadFileFromRequest`-এর `dest` এখন একটি string path।                                            |
| Events        | `dispatch` একটি `MeghEvent` instance নেয়। Kafka এবং RabbitMQ broadcast exception throw করে। Socket broadcast-এর জন্য `useSocketIo()` লাগে। `getListeners` একটি class বা event নেয়, এবং `flushOnce` সরিয়ে ফেলা হয়েছে।                                                                                                 |
| Queues        | `@MeghWorker` আর import-এর সময় চালু হয় না; `app.useWorker([...])` দিয়ে register করুন।                                                                                                                                                                                                                                 |
| Cache         | Memory store প্রতিটি instance-এর জন্য আলাদা এবং TTL কার্যকর করা হয়।                                                                                                                                                                                                                                                     |
| Logging       | Default-ভাবে JSON; pretty output শুধু development-এ, `pino-pretty` install থাকলে।                                                                                                                                                                                                                                        |
| Results       | `Results.Ok(x)` এখন `{ headers, data, statusCode }` হিসেবে serialize হয়।                                                                                                                                                                                                                                                |
| সরানো export  | `registerKnex`, `FEATURE_KEY`, `uuid`, `getLineNumber`, `MatchLocation`, `extrctParamFromUrl`, `findDuplicates`, `isClassValidator`, `validateRequestBody`, `OkOptions`, `Results.code`, `KafkaBroadcastOption`, `RabbitMqBroadcastOption`, এবং `ControllerOptions.version`/`since`/`meta`।                              |

---

## Known Issues in 0.3.0

এগুলো 0.3.0-এর regression বা ঘাটতি, যেগুলো একটি patch release-এ ঠিক হওয়ার কথা:

- **স্পষ্ট constructor ছাড়া `@Repository` এবং `@Queue` class dependency
  injection-এর অধীনে ভেঙে যায়।** `constructor() { super(); }` যোগ করুন।
- **`Results.Created`, `Results.NoContent`,
  `Results.NotFound`, `HttpResponse.Created` এবং `@HttpCode`-এর status code প্রয়োগ হয় না।**
  Response 200 হয়। Error status পাঠাতে `HttpExceptions` throw করুন।
- **Generate করা OpenAPI document-এ `@Body()`/`@Query()` DTO নেই।**
  Validation তবুও চলে। আপাতত `@OpenApi({ requestBody, query })` দিয়ে
  এগুলো বর্ণনা করুন।
- **`@All()` `app.run()`-কে crash করায়।**
- **Upload policy লঙ্ঘনে 500 return হয়**, 400 বা 413 নয়।
- **`app.run()`-এ কোনো `host` option নেই।** Server localhost-এ bind হয়।

---

## Roadmap to 1.0.0

1.0.0 হবে stable API-সহ প্রথম release। তার আগ পর্যন্ত minor release-এ
(0.6, 0.7, …) breaking change থাকতে পারে, প্রতিটির সাথে একটি upgrade guide থাকে।

1.0.0-এর বাকি কাজ [`1.0.0` milestone](https://github.com/meghjs/megh/milestone/1)-এ
issue হিসেবে track করা হয়, আর সংক্ষেপে আছে
[`1.0-CHECKLIST.md`](https://github.com/meghjs/megh/blob/main/1.0-CHECKLIST.md)-এ।
বাকি আছে মূলত core-এর correctness fix, security header, rate limiting ও
compression, global route prefix, test, এবং public API ছোট করা।

---

## Repository-র গঠন

এই monorepo-তে প্রতিটি Megh package এবং docs site-এর source রাখা আছে, যাতে framework, এর CLI template এবং এর documentation-এর পরিবর্তন একটি commit-এই যুক্ত করা যায়।

| Folder           | Package / site                                                 | যেখান থেকে publish হয়                                                |
| ---------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/core/` | [`@meghjs/core`](https://www.npmjs.com/package/@meghjs/core)   | এই repository (Lerna)                                                 |
| `packages/cli/`  | [`@meghjs/cli`](https://www.npmjs.com/package/@meghjs/cli)     | এই repository (Lerna)                                                 |
| `packages/data/` | [`@meghjs/data`](https://www.npmjs.com/package/@meghjs/data)   | এই repository (Lerna)                                                 |
| `docs/`          | https://meghjs.github.io (VitePress)                           | [meghjs/meghjs.github.io](https://github.com/meghjs/meghjs.github.io) |
| `resources/`     | Logo এবং favicon                                               | প্রযোজ্য নয়                                                          |
| `scripts/`       | `mirror.sh`, যা `docs/`-কে এর আলাদা repository-র সাথে sync করে | প্রযোজ্য নয়                                                          |

`1.0-CHECKLIST.md` 1.0 release-এর কাজের হিসাব রাখে; বর্তমান roadmap নিচে [Roadmap to 1.0.0](#roadmap-to-100)-এ দেওয়া আছে।

`packages/*` হলো [Lerna](https://lerna.js.org) দিয়ে চালানো npm workspace: root-এ একটিমাত্র lockfile থাকে, এবং `packages/cli` `@meghjs/core`-কে local source থেকে resolve করে। `packages/`-এর প্রতিটি package npm-এ publish হয়, যদি না তার `package.json`-এ `"private": true` থাকে। নতুন কোনো internal library-র জন্য শুধু `packages/`-এর অধীনে একটি scoped নামসহ (`@meghjs/...`) folder এবং `"publishConfig": { "access": "public" }` লাগে। `docs/` কোনো workspace নয় এবং এর নিজস্ব lockfile আছে।

---

## Megh-এ কাজ করা

যা লাগবে: Node.js 22.22+ অথবা 24.15+ (Lerna 10-এর জন্য), npm এবং git। Publish করা package-গুলো Node.js 22 এবং এর নতুন version support করে, এবং CI এগুলোকে Node.js 22 ও 24-এ test করে।

```bash
npm run setup       # npm ci at the root (all packages) and in docs
npm run build       # build every package (lerna run build)
npm run typecheck
npm test            # every package's tests
npm run lint        # core
npm run docs:dev    # docs site at http://localhost:5173
npm run docs:build  # fails on dead links
```

প্রতিটি package-এ সরাসরিও কাজ করা যায়, যেমন `cd packages/core && npm test`, অথবা `npx lerna run test --scope @meghjs/core` দিয়ে। Dependency package-এর ভেতর থেকে নয়, root থেকে `npm install <dep> -w @meghjs/core` দিয়ে install করুন।

Generate করা কোনো app-এ `core`-এর local পরিবর্তন পরীক্ষা করতে `packages/core/`-এ `npm run build` চালান, তারপর app-এ `npm install <path-to>/packages/core` চালান।

---

## Publishing ও deployment

সব package একই version share করে (Lerna fixed mode, `lerna.json`-এ) এবং `main` থেকে একসাথে release করা হয়:

```bash
npm run release     # lerna version
```

`lerna version` শেষ `v*` tag-এর পর থেকে conventional commit-গুলো দেখে পরের version ঠিক করে (`fix:` হলো patch, `feat:` হলো minor, `BREAKING CHANGE` হলো major), প্রতিটি package-এর version বাড়ায়, প্রতিটি `CHANGELOG.md` লেখে, `chore(release): vX.Y.Z` commit করে, এবং commit ও tag push করে। Version নিজে ঠিক করতে একটি version দিন, যেমন `npm run release -- 0.4.0`।

`v*` tag-টি `.github/workflows/release.yml` চালু করে। এটি সবকিছু type-check, lint, test ও build করে, তারপর `lerna publish from-package` চালায়, যা provenance-সহ এমন প্রতিটি public package publish করে যার version এখনো npm-এ নেই। এর জন্য এই repository-তে একটি `NPM_TOKEN` secret লাগে।

Docs site এখনো তার আলাদা repository থেকে deploy হয়। `npm run mirror` `git subtree split` ব্যবহার করে `docs/`-এর history [meghjs/meghjs.github.io](https://github.com/meghjs/meghjs.github.io)-এ push করে, যা https://meghjs.github.io deploy করে। ওই repository-তে শুধু `mirror.sh`-এর মাধ্যমে commit করুন: সেখানে সরাসরি কোনো commit করলে সেটি monorepo-তে আনা না হওয়া পর্যন্ত পরের push ব্যর্থ হবে।

---

## Release ও versioning

- **Semver।** 1.0-এর আগে minor release-এ (`0.5` → `0.6`) breaking change থাকতে পারে, patch release-এ নয়। 1.0 থেকে breaking change পরের major release-এর জন্য অপেক্ষা করে এবং তার আগে একটি minor release-এ deprecated থাকে। দেখুন [versioning policy](https://meghjs.github.io/reference/versioning)।
- **Release-এর ক্রম।** `core` এবং `cli` একই version-এ একসাথে release করা হয়। এরপর `docs`-এ version update করুন।

---

## নিরাপত্তা

অনুগ্রহ করে vulnerability-গুলো public issue-তে না জানিয়ে গোপনে maintainer-কে ([GitHub @xtareq](https://github.com/xtareq)) জানান।

---

## License

MIT © [Tareq Hossain](https://github.com/xtareq)
