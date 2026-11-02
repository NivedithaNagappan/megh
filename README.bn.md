<p align="center">
  <img src="resources/megh-logo.png" alt="MeghJs" width="320" />
</p>

<p align="center"><a href="README.md">English</a> | <b>বাংলা</b></p>

# Megh

![npm version](https://img.shields.io/npm/v/@meghjs/core.svg)
![CI](https://github.com/meghjs/megh/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/npm/l/@meghjs/core.svg)

Megh হলো [Fastify](https://fastify.dev)-এর ওপর তৈরি একটি TypeScript-first ওয়েব ফ্রেমওয়ার্ক, যা ন্যূনতম বয়লারপ্লেট দিয়ে স্কেলযোগ্য ও রক্ষণাবেক্ষণযোগ্য REST API তৈরির জন্য ডিজাইন করা হয়েছে। এটি ডেকোরেটর-ভিত্তিক রাউটিং, বিল্ট-ইন ডিপেন্ডেন্সি ইনজেকশন, স্বয়ংক্রিয় OpenAPI ডকুমেন্টেশন এবং প্রথম সারির ভ্যালিডেশন সাপোর্ট দেয়।

> **আগে এর নাম ছিল Avleon।** `@avleon/*` এখন `@meghjs/*`। দেখুন
> [Avleon থেকে Megh-এ স্থানান্তর](https://meghjs.github.io/getting-started/upgrading-megh)।

ডকুমেন্টেশন: **https://meghjs.github.io**

> **0.2 থেকে আপগ্রেড করছেন?** 0.3-এ অথরাইজেশন, ভ্যালিডেশন,
> পেজিনেশন, ফাইল স্টোরেজ এবং ডিপেন্ডেন্সিতে ব্রেকিং পরিবর্তন আছে। দেখুন [0.3-এ আপগ্রেড করা](#03-এ-আপগ্রেড-করা)।

---

## সূচিপত্র

- [ফিচারসমূহ](#ফিচারসমূহ)
- [ইনস্টলেশন](#ইনস্টলেশন)
- [দ্রুত শুরু](#দ্রুত-শুরু)
- [মূল ধারণাসমূহ](#মূল-ধারণাসমূহ)
  - [অ্যাপ্লিকেশন](#অ্যাপ্লিকেশন)
  - [কন্ট্রোলার](#কন্ট্রোলার)
  - [রাউট মেথড](#রাউট-মেথড)
  - [প্যারামিটার ডেকোরেটর](#প্যারামিটার-ডেকোরেটর)
  - [এরর হ্যান্ডলিং](#এরর-হ্যান্ডলিং)
  - [মিডলওয়্যার](#মিডলওয়্যার)
  - [অথেনটিকেশন](#অথেনটিকেশন)
  - [অথরাইজেশন](#অথরাইজেশন)
  - [ভ্যালিডেশন](#ভ্যালিডেশন)
  - [কনফিগারেশন](#কনফিগারেশন)
  - [লগিং](#লগিং)
  - [OpenAPI ডকুমেন্টেশন](#openapi-ডকুমেন্টেশন)
- [অ্যাডভান্সড ফিচারসমূহ](#উন্নত-ফিচারসমূহ)
  - [মডেল (ORM)](#মডেল-orm)
  - [ডেটাবেস](#ডেটাবেস)
  - [পেজিনেশন](#পেজিনেশন)
  - [ইভেন্ট](#ইভেন্ট)
  - [কিউ ও ওয়ার্কার](#কিউ-ও-ওয়ার্কার)
  - [টাস্ক শিডিউলিং](#টাস্ক-শিডিউলিং)
  - [ক্যাশিং](#ক্যাশিং)
  - [ফাইল আপলোড](#ফাইল-আপলোড)
  - [স্ট্যাটিক ফাইল](#স্ট্যাটিক-ফাইল)
  - [WebSocket (Socket.IO)](#websocket-socketio)
- [রাউট ম্যাপিং (ফাংশনাল স্টাইল)](#রাউট-ম্যাপিং-ফাংশনাল-স্টাইল)
- [টেস্টিং](#টেস্টিং)
- [প্রোডাকশন](#প্রোডাকশন)
- [0.3-এ আপগ্রেড করা](#03-এ-আপগ্রেড-করা)
- [0.3.0-এর পরিচিত সমস্যাসমূহ](#030-এর-জানা-সমস্যাসমূহ)
- [1.0.0 পর্যন্ত রোডম্যাপ](#100-এর-রোডম্যাপ)
- [রিপোজিটরির গঠন](#রিপোজিটরির-গঠন)
- [Megh-এ কাজ করা](#megh-এ-কাজ-করা)
- [পাবলিশিং ও ডিপ্লয়মেন্ট](#প্রকাশ-ও-ডিপ্লয়মেন্ট)
- [রিলিজ ও ভার্সনিং](#রিলিজ-ও-ভার্সনিং)
- [নিরাপত্তা](#নিরাপত্তা)
- [লাইসেন্স](#লাইসেন্স)

---

## ফিচারসমূহ

- 🎯 **ডেকোরেটর-ভিত্তিক রাউটিং** — TypeScript ডেকোরেটর দিয়ে কন্ট্রোলার ও রাউট সংজ্ঞায়িত করুন
- 💉 **ডিপেন্ডেন্সি ইনজেকশন** — `MeghContainer`, `@Injectable` এবং `Token`, বর্তমানে [TypeDI](https://github.com/typestack/typedi)-এর ওপর ভিত্তি করে
- 📄 **OpenAPI / Swagger** — Swagger UI বা [Scalar](https://scalar.com) দিয়ে স্বয়ংক্রিয় ডকুমেন্টেশন
- ✅ **ভ্যালিডেশন** — [class-validator](https://github.com/typestack/class-validator)-এর মাধ্যমে রিকোয়েস্ট DTO ভ্যালিডেট ও হোয়াইটলিস্ট করা হয়
- 🔑 **অথেনটিকেশন** — প্লাগযোগ্য হ্যান্ডলার যা `request.user` পূরণ করে
- 🔒 **অথরাইজেশন** — ডিফল্টভাবে প্রবেশাধিকার নিষিদ্ধ (deny-by-default) `@Authorized` রাউট
- 📁 **ফাইল আপলোড** — নিরাপদ, সীমাবদ্ধ স্টোরেজসহ multipart সাপোর্ট
- 🧬 **মডেল ও মাইগ্রেশন** — [Kysely](https://kysely.dev)-এর ওপর তৈরি টাইপ-সেফ, Eloquent-স্টাইলের মডেল ও মাইগ্রেশন
- 🗄️ **ডেটাবেস** — একই পেজিনেশন কাঠামোসহ TypeORM ও Knex ইন্টিগ্রেশন
- ⚙️ **কনফিগ** — টাইপড, এনভায়রনমেন্ট-সচেতন কনফিগ ক্লাস
- 📣 **ইভেন্ট** — কিউ-ভিত্তিক ডেলিভারি ও Socket.IO ব্রডকাস্টসহ টাইপড ইভেন্ট
- 📬 **কিউ ও ওয়ার্কার** — [BullMQ](https://docs.bullmq.io)-এ ব্যাকগ্রাউন্ড জব, টেস্টের জন্য ইন-মেমরি ড্রাইভারসহ
- ⏰ **টাস্ক শিডিউলিং** — cron, interval ও timeout জব
- 🗃️ **ক্যাশিং** — ইন-মেমরি বা Redis, TTL ও ট্যাগ-ভিত্তিক ইনভ্যালিডেশনসহ
- 📝 **লগিং** — [pino](https://getpino.io)-এর মাধ্যমে স্ট্রাকচার্ড JSON লগ
- 🔌 **WebSocket** — Socket.IO ইন্টিগ্রেশন
- 🧪 **টেস্টিং** — বিল্ট-ইন টেস্ট ইউটিলিটি

---

## ইনস্টলেশন

Megh-এর জন্য **Node.js 22 বা তার নতুন ভার্সন** প্রয়োজন।

CLI ব্যবহার করে একটি নতুন প্রজেক্ট তৈরি করুন:

```bash
npx @meghjs/cli new myapp
# or
yarn dlx @meghjs/cli new myapp
# or
pnpm dlx @meghjs/cli new myapp
```

অথবা ম্যানুয়ালি ইনস্টল করুন:

```bash
npm install @meghjs/core reflect-metadata class-validator class-transformer
```

`class-validator` ও `class-transformer` ঐচ্ছিক peer হিসেবে ঘোষিত, কিন্তু
প্যাকেজটি লোড হওয়ার সময়ই এগুলো ইমপোর্ট করে, তাই প্রতিটি প্রজেক্টে এগুলো ইনস্টল করুন।

`tsconfig.json`-এ ডেকোরেটর চালু করুন:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### ঐচ্ছিক ডিপেন্ডেন্সি

Megh ইন্টিগ্রেশনগুলোকে মূল ইনস্টলের বাইরে রাখে। শুধু যা ব্যবহার করবেন তা-ই যোগ করুন।
এগুলোর কোনোটি ছাড়াই প্যাকেজটি ঠিকঠাক ইমপোর্ট হয়, আর কোনো ফিচারের যখনই এগুলোর একটি প্রয়োজন হয়,
তখনই আপনি একটি স্পষ্ট এরর পাবেন:

| ফিচার                                      | ইনস্টল                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| CORS (`useCors`)                             | `npm i @fastify/cors`                                                             |
| ফাইল আপলোড (`useMultipart`, `@UploadFile`) | `npm i @fastify/multipart`                                                        |
| স্ট্যাটিক ফাইল (`useStaticFiles`)              | `npm i @fastify/static`                                                           |
| Swagger UI সহ OpenAPI                      | `npm i @fastify/swagger @fastify/swagger-ui`                                      |
| Scalar সহ OpenAPI                          | `npm i @fastify/swagger @scalar/fastify-api-reference`                            |
| মডেল ও মাইগ্রেশন (`useDatabase`)        | `npm i kysely` + একটি ড্রাইভার (`pg`, `mysql2`, `better-sqlite3`)                      |
| TypeORM                                      | `npm i typeorm` + একটি ড্রাইভার (`pg`, `mysql2`, `sqlite3`, `better-sqlite3`, `mssql`) |
| Knex                                         | `npm i knex` + একটি ড্রাইভার                                                           |
| কিউ ও ওয়ার্কার                             | `npm i bullmq ioredis` (`memory`/`sync` ড্রাইভারের সাথে প্রয়োজন নেই)              |
| Redis ক্যাশ                                  | `npm i ioredis`                                                                   |
| WebSocket                                    | `npm i socket.io fastify-socket.io`                                               |
| `FileStorage`-এ ইমেজ ট্রান্সফর্ম            | `npm i sharp`                                                                     |
| সুন্দর ফরম্যাটের ডেভ লগ                              | `npm i -D pino-pretty`                                                            |

### মডিউল ফরম্যাট

`@meghjs/core` একটিমাত্র CommonJS বিল্ড সরবরাহ করে। ESM প্রজেক্টগুলোও
`import { ... } from '@meghjs/core'` ব্যবহার করতে পারে। শুধু প্যাকেজ রুট এক্সপোর্ট করা হয়:
`@meghjs/core/dist/...`-এর মতো ডিপ ইমপোর্ট সমর্থিত নয়।

---

## দ্রুত শুরু

### ন্যূনতম (ফাংশনাল স্টাইল)

```typescript
import { Megh } from "@meghjs/core";

const app = Megh.createApplication();

app.mapGet("/", () => ({ message: "Hello, Megh!" }));

app.run(4000);
```

### কন্ট্রোলার স্টাইল

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

## মূল ধারণাসমূহ

### অ্যাপ্লিকেশন

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
`NODE_ENV` প্রোডাকশন হিসেবে গণ্য হয়।

---

### কন্ট্রোলার

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

### রাউট মেথড

| ডেকোরেটর        | HTTP মেথড |
| ---------------- | ----------- |
| `@Get(path?)`    | GET         |
| `@Post(path?)`   | POST        |
| `@Put(path?)`    | PUT         |
| `@Patch(path?)`  | PATCH       |
| `@Delete(path?)` | DELETE      |

---

### প্যারামিটার ডেকোরেটর

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

| ডেকোরেটর       | উৎস                     |
| --------------- | -------------------------- |
| `@Param(key?)`  | রাউট পাথের প্যারামিটার          |
| `@Query(key?)`  | কোয়েরি স্ট্রিং               |
| `@Body()`       | রিকোয়েস্ট বডি               |
| `@Header(key?)` | রিকোয়েস্ট হেডার            |
| `@AuthUser()`   | বর্তমান অথেনটিকেটেড ইউজার |

আপনি যদি tsx, esbuild বা SWC দিয়ে কম্পাইল করেন, তাহলে কম্পাইলার ডেকোরেটর
মেটাডেটা তৈরি করে না। ভ্যালিডেশন যেন তবুও চলে, সেজন্য DTO টাইপটি স্পষ্টভাবে পাস করুন:

```typescript
create(@Body({ type: CreateUserDto }) body: CreateUserDto) { ... }
```

---

### এরর হ্যান্ডলিং

200 ছাড়া অন্য কোনো রেসপন্স পাঠাতে একটি `HttpExceptions` এরর থ্রো করুন:

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

উপলব্ধ এক্সেপশনসমূহ: `badRequest` (400), `unauthorized` (401), `forbidden` (403),
`notFound` (404), `validationError` এবং `internalError` (500)।

এরর রেসপন্সের গঠন হলো `{ code, status: "Error", message, data? }`।
ডেভেলপমেন্ট ছাড়া অন্য পরিবেশে, 5xx রেসপন্স message ও data লুকিয়ে রাখে এবং
`"Internal Server Error"` রিটার্ন করে।

---

### মিডলওয়্যার

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

`@UseMiddleware` দিয়ে মিডলওয়্যারকে একটি কন্ট্রোলার বা রাউটের মধ্যে সীমাবদ্ধ করুন। 0.3.0-এ
একটি **ইনস্ট্যান্স** পাস করুন। ক্লাস রূপটি বুট করার সময় ক্র্যাশ করে (দেখুন
[পরিচিত সমস্যা](#030-এর-জানা-সমস্যাসমূহ)):

```typescript
// Apply to entire controller
@UseMiddleware(new LoggingMiddleware())
@ApiController('/users')
class UserController { ... }

// Or apply to a specific route
@ApiController('/users')
class UserController {
  @UseMiddleware(new LoggingMiddleware())
  @Get('/')
  getAll() { ... }
}
```

রিকোয়েস্টগুলো ক্রমানুসারে এই ধাপগুলোর মধ্য দিয়ে যায়:

1. গ্লোবাল মিডলওয়্যার (`useMiddlewares`)
2. অথেনটিকেশন
3. ক্লাসের `@Authorized`, তারপর মেথডের `@Authorized`
4. ক্লাসের `@UseMiddleware`, তারপর মেথডের `@UseMiddleware`
5. প্যারামিটার ভ্যালিডেশন
6. হ্যান্ডলার

---

### অথেনটিকেশন

অথেনটিকেশন নির্ধারণ করে কলার _কে_। একটি হ্যান্ডলার রেজিস্টার করুন; সেটি যা
রিটার্ন করে তা-ই `request.user` হয়, এবং `@AuthUser()` এই মানটিই ইনজেক্ট করে।

**1 — আপনার অথেনটিকেশন ক্লাস ডিফাইন করুন:**

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

**2 — অ্যাপে রেজিস্টার করুন:**

```typescript
app.useAuthentication(JwtAuthentication);
```

**3 — যেকোনো কন্ট্রোলারে ইউজারকে পড়ুন:**

```typescript
@ApiController("/me")
class MeController {
  @Get()
  whoami(@AuthUser() user: User) {
    return user;
  }
}
```

`null` রিটার্ন করলে `request.user` সেট হয় না। অথেনটিকেশন শুধু কলারকে শনাক্ত
করে; অজ্ঞাতপরিচয় (anonymous) রিকোয়েস্ট প্রত্যাখ্যান করা অথরাইজেশনের কাজ।

---

### অথরাইজেশন

অথরাইজেশন **ডিফল্টভাবে নিষেধ (deny-by-default)**। `@Authorized` চিহ্নিত কোনো রাউট
**403** দেয়, যদি না একটি অথরাইজার রেজিস্টার করা থাকে এবং সেটি রিকোয়েস্টটি অনুমোদন করে।

**1 — আপনার অথরাইজেশন ক্লাস ডিফাইন করুন।** নিষেধ করতে `false` (→ 403) রিটার্ন করুন অথবা একটি
`HttpExceptions` এরর থ্রো করুন। অন্য যেকোনো রিটার্ন মান রিকোয়েস্টটি অনুমোদন করে:

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

**2 — অ্যাপে রেজিস্টার করুন:**

```typescript
app.useAuthorization(JwtAuthorization);

// or register several by name, and pick one with @Authorized('jwt')
app.useAuthorization({ jwt: JwtAuthorization, apiKey: ApiKeyAuthorization });
```

**3 — কন্ট্রোলার বা রাউট সুরক্ষিত করুন:**

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

কোনো অথরাইজার রেজিস্টার করা না থাকলে, Megh বুট করার সময় একটি সতর্কবার্তা লগ করে এবং প্রতিটি
`@Authorized` রাউট 403 রিটার্ন করে। যে নামে কোনো হ্যান্ডলার রেজিস্টার করা নেই, সেই নামে `@Authorized('name')`
ব্যবহার করলে `app.run()` ব্যর্থ হয়।

---

### ভ্যালিডেশন

ভ্যালিডেশন `class-validator` দ্বারা পরিচালিত। আপনার DTO-গুলোতে ডেকোরেটর যোগ করুন, আর Megh স্বয়ংক্রিয়ভাবে `@Body()` ও `@Query()` ভ্যালিডেট করবে:

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

- হ্যান্ডলার **রূপান্তরিত DTO ইনস্ট্যান্স** পায়, তাই `class-transformer`
  ডেকোরেটর যেমন `@Type(() => Number)` প্রযোজ্য হয়।
- DTO-তে ঘোষণা করা হয়নি এমন প্রপার্টি **প্রত্যাখ্যাত** হয় (`whitelist` +
  `forbidNonWhitelisted`), যা mass assignment প্রতিরোধ করে।

ভ্যালিডেশন ব্যর্থ হলে **400** রিটার্ন করে:

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

নেস্টেড এররগুলো ডট-যুক্ত পাথ ব্যবহার করে (`address.city`)।

একই নিয়মে কোনো মান নিজে ভ্যালিডেট করতে
`transformAndValidate(Dto, value)` কল করুন। এটি `{ value, errors }` রিটার্ন করে।

---

### কনফিগারেশন

কনফিগ ক্লাস environment variable-গুলোকে টাইপড, ইনজেক্ট করা যায় এমন সেটিংসে রূপান্তর করে।
`MeghConfig` extend করুন এবং `@AppConfig` দিয়ে রেজিস্টার করুন:

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

একটি কনফিগ ক্লাসকে অবশ্যই `extend MeghConfig` করতে হবে। `useKnex`, `useTypeORM` বা `useOpenApi`-তে
কোনো কনফিগ ক্লাস পাস করলে Megh এভাবেই সেটিকে চিনতে পারে।

---

### লগিং

`LoggerService` হলো [pino](https://getpino.io)-এর একটি wrapper। ডিফল্টভাবে এটি structured JSON
লেখে, আর শুধু তখনই সুন্দরভাবে ফরম্যাট করা আউটপুট দেয় যখন `NODE_ENV=development` থাকে এবং `pino-pretty`
ইনস্টল করা থাকে। ফ্রেমওয়ার্কের লগ (ইভেন্ট, কিউ, ওয়ার্কার, scheduler) একই logger-এর
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

Megh এই logger Fastify-কে দেয় না। একটিই pino instance শেয়ার করতে চাইলে সেটি
স্পষ্টভাবে পাস করুন: `LoggerService.getPino()`।

---

### OpenAPI ডকুমেন্টেশন

প্রথমে আপনার পছন্দের UI ইনস্টল করুন: `@fastify/swagger` সাথে `@fastify/swagger-ui`,
অথবা Scalar-এর জন্য `@scalar/fastify-api-reference`।

**ইনলাইন কনফিগ:**

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

**কনফিগ ক্লাস:**

```typescript
import { AppConfig, MeghConfig, Environment } from "@meghjs/core";

@AppConfig
export class OpenApiConfig extends MeghConfig {
  config(env: Environment) {
    return {
      info: { title: "My API", version: "1.0.0" },
      routePrefix: "/docs",
      provider: "scalar", // or 'default' for Swagger UI
    };
  }
}

// In app.ts. Only active when NODE_ENV=development.
if (app.isDevelopment()) {
  app.useOpenApi(OpenApiConfig);
}
```

**`@OpenApi` দিয়ে রাউট-লেভেলের ডকুমেন্টেশন:**

```typescript
import { OpenApi, OpenApiProperty, OpenApiSchema } from '@meghjs/core';

@OpenApiSchema()
export class UserQuery {
  @OpenApiProperty({ type: 'string', example: 'john', required: false })
  @IsOptional()
  search?: string;

  @OpenApiProperty({ type: 'integer', example: 1, required: false })
  @IsOptional()
  page?: number;
}

@OpenApi({
  summary: 'Get all users',
  tags: ['users'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      description: 'List of users',
      type: 'object',
      properties: {
        data: { type: 'array' },
        total: { type: 'integer', example: 100 },
      },
    },
    401: { description: 'Unauthorized' },
  },
})
@Get('/')
getAll(@Query() query: UserQuery) { ... }
```

স্কিমা শুধু ডেকোরেট করা প্রপার্টি থেকেই তৈরি হয়, আর nested DTO-গুলো
`components.schemas`-এর অধীনে `$ref` হয়ে যায়।

---

## উন্নত ফিচারসমূহ

### মডেল (ORM)

[Kysely](https://kysely.dev)-এর উপর তৈরি টাইপ-সেফ মডেল: কলামের নাম, মানের
টাইপ এবং লোড করা রিলেশন TypeScript দিয়ে যাচাই করা হয়।

```bash
npm install kysely pg   # or: mysql2, better-sqlite3
```

```typescript
import { Model, hasMany } from "@meghjs/core";
import { Post } from "./post.model";

export class User extends Model {
  static readonly table = "users";

  id!: number;
  email!: string;
  name!: string | null;

  posts = hasMany(() => Post);
}

// app.ts
app.useDatabase(db); // a Kysely instance

const users = await User.where("email", "like", "%@acme.io")
  .with("posts")
  .orderBy("name")
  .get();
```

মাইগ্রেশনগুলো `src/database/migrations`-এ থাকে এবং CLI দিয়ে চালানো হয়:

```bash
npx megh make:migration create_users_table
npx megh migrate
```

রিলেশন, টাইমস্ট্যাম্প, সফট ডিলিট, কাস্ট, ট্রানজ্যাকশন এবং মাইগ্রেশন
কমান্ডগুলো [মডেল (ORM) গাইডে](https://meghjs.github.io/advanced/orm) বিস্তারিত আলোচনা করা হয়েছে।

---

### ডেটাবেস

TypeORM এবং Knex সাপোর্ট [`@meghjs/data`](https://github.com/meghjs/megh/tree/main/packages/data) নামের একটি প্লাগইনে রয়েছে:
এটি ইনস্টল করলে `app.useTypeORM()` / `app.useKnex()` ব্যবহারযোগ্য হয়।

```bash
npm install @meghjs/data typeorm pg   # or: knex pg
```

---

### পেজিনেশন

প্রতিটি পেজিনেটর (`Collection`, `@InjectRepository`, `MeghRepository`,
`KnexDB`) `{ page, perPage }` গ্রহণ করে এবং একই কাঠামো রিটার্ন করে:

```json
{
  "data": [ ... ],
  "meta": { "total": 57, "page": 2, "perPage": 20, "lastPage": 3, "next": 3, "prev": 1 }
}
```

`page`-এর ডিফল্ট মান 1 এবং `perPage`-এর ডিফল্ট মান 10। `Paginated<T>` এবং `PageRequest`
টাইপগুলো এক্সপোর্ট করা হয়।

---

### ইভেন্ট

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

- লিসেনারগুলো ইভেন্ট ক্লাস অনুযায়ী নিবন্ধিত হয়।
- `once` লিসেনার ঠিক একবারই চলে, এমনকি একসাথে একাধিক ডিসপ্যাচ হলেও।
- কিউতে থাকা যে জবগুলো বারবার ব্যর্থ হয় সেগুলো
  `EventQueue.getInstance().getFailedJobs()`-এ সংরক্ষিত থাকে।
- Kafka এবং RabbitMQ ব্রডকাস্ট 0.3-এ ইমপ্লিমেন্ট করা হয়নি, এবং এগুলো ব্যবহার করলে
  এরর থ্রো হয়।

---

### কিউ ও ওয়ার্কার

ব্যাকগ্রাউন্ড জব [BullMQ](https://docs.bullmq.io)-এর উপর চলে। একটি
Redis ক্লায়েন্টের সাথে এটি ইনস্টল করুন:

```bash
npm i bullmq ioredis
```

একটি কিউ জব তৈরি এবং প্রসেস দুটোই করে। প্রতিটি জবের নাম `@JobHandler` দিয়ে দিন।
0.3.0-এ ক্লাসটিতে একটি স্পষ্ট কনস্ট্রাক্টর লাগবে যা `super()` কল করে (দেখুন
[পরিচিত সমস্যা](#030-এর-জানা-সমস্যাসমূহ)):

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

যেখানেই কিউটি ইনজেক্ট করা হয়েছে, সেখান থেকে জব ডিসপ্যাচ করুন:

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

বেস ক্লাসে ঘোষিত হ্যান্ডলারগুলো ইনহেরিট হয়, এবং একটি সাবক্লাস একই জবের নাম
পুনরায় ব্যবহার করে যেকোনো হ্যান্ডলার ওভাররাইড করতে পারে।

**শুধু-প্রডিউসার কিউ।** অন্য কোনো প্রসেস জবগুলো প্রসেস করলে `worker: false`
পাস করুন। এতে কোনো ওয়ার্কার চালু হয় না:

```typescript
@Queue({ name: "reports", worker: false })
export class ReportProducer extends MeghQueue<ReportPayload> {
  constructor() {
    super();
  }
}
```

**স্বতন্ত্র ওয়ার্কার।** কনজিউমার যখন নিজস্ব প্রসেসে চলে, তখন
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

কিউ ও ওয়ার্কারগুলো রেজিস্টার করুন, যাতে সেগুলো অ্যাপের সাথে চালু হয় এবং শাটডাউনের সময় বন্ধ হয়।
শুধু ওয়ার্কার ক্লাসে ডেকোরেটর দিলেই এটি আর চালু হয় না:

```typescript
app.useWorker([EmailQueue, EmailWorker]);
```

**ইন-মেমরি ড্রাইভার।** টেস্ট ও লোকাল ডেভেলপমেন্টে Redis ছাড়াই কিউ চালান।
`memory` জবগুলো অ্যাসিঙ্ক্রোনাসভাবে চালায় এবং `delay` মেনে চলে। `sync` প্রতিটি জব
`add()` রিজলভ হওয়ার আগেই চালায়:

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

### টাস্ক শিডিউলিং

একটি ক্লাসকে `@ScheduledTask()` দিয়ে চিহ্নিত করুন, তারপর এর মেথডগুলো শিডিউল করুন:

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

শিডিউল করা মেথডগুলো ইনহেরিট হয়, এবং একটি সাবক্লাস প্রতিটি মেথড আলাদাভাবে
ওভাররাইড করতে পারে।

টাস্কগুলো সরাসরি রেজিস্টার করুন, অথবা স্বয়ংক্রিয়ভাবে খুঁজে নিতে দিন:

```typescript
app.useScheduler([ReportTask]);
// or
app.useScheduler({ path: "src/tasks" });
```

---

### ক্যাশিং

ডিফল্টভাবে ইন-মেমোরি; এর বদলে Redis ব্যবহার করতে `provider: 'redis'` দিন।

```typescript
app.useCache({ provider: "memory" });

// Redis (requires: npm i ioredis)
app.useCache({
  provider: "redis",
  redisOptions: { host: "127.0.0.1", port: 6379 },
});
```

যেখানে প্রয়োজন সেখানে `CacheManager` ইনজেক্ট করুন। এন্ট্রিগুলোতে ট্যাগ থাকতে পারে, ফলে সম্পর্কিত
কী-গুলো একসাথে ইনভ্যালিডেট হয়:

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

TTL সেকেন্ডে হিসাব করা হয়; `0` বা তার কম মানে মেয়াদ শেষ হবে না। মেমোরি স্টোর মেয়াদোত্তীর্ণ
এন্ট্রিগুলো রিড করার সময় এবং একটি ব্যাকগ্রাউন্ড সুইপে মুছে ফেলে, ডিফল্টভাবে প্রতি 60 s পরপর। এর
কোনো সাইজ সীমা নেই। প্রতিটি `new CacheManager()`-এর নিজস্ব স্টোর থাকে; `useCache` দিয়ে
রেজিস্টার করা ইনস্ট্যান্সটি DI-এর মাধ্যমে শেয়ার করা হয়।

---

### ফাইল আপলোড

```typescript
// Configure multipart support (requires @fastify/multipart)
app.useMultipart({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});
```

```typescript
import { FileStorage, UploadFile, MultipartFile, OpenApi } from "@meghjs/core";

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

`FileStorage` ডিফল্টভাবে নিরাপদ:

- সেভ করা ফাইলগুলো এক্সটেনশন বজায় রেখে একটি **র‍্যান্ডম UUID নাম** পায়। নাম বেছে নিতে
  `saveAs: 'name.jpg'` অথবা `preserveFilename: true` দিন।
- `overwrite`-এর ডিফল্ট মান `false`।
- শুধুমাত্র প্রচলিত নিরাপদ এক্সটেনশনগুলো গ্রহণ করা হয়। HTML, SVG এবং JS প্রত্যাখ্যান করা হয়।
- ডিফল্ট সাইজ সীমা 50 MB, যা স্ট্রিমিং চলাকালীন প্রয়োগ করা হয়।
- `to`, `download`, `downloadAs`, `getUploadFile` এবং `remove` সহ প্রতিটি পাথ
  `baseDir`-এর মধ্যে সীমাবদ্ধ। ফাইল না পাওয়া গেলে 404 দেয়।

ডিফল্টগুলো একবার কনফিগার করুন, অথবা প্রতিটি কলে ওভাররাইড করুন:

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

### স্ট্যাটিক ফাইল

```typescript
import path from "path";

// requires @fastify/static
app.useStaticFiles({
  path: path.join(process.cwd(), "public"),
  prefix: "/static/",
});
```

---

### WebSocket (Socket.IO)

```typescript
// requires socket.io and fastify-socket.io
app.useSocketIo({ cors: { origin: "*" } });
```

`SocketEventDispatcher` দিয়ে ক্লায়েন্টদের কাছে ইভেন্ট পুশ করুন:

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

আপনি একটি ডোমেইন ইভেন্টও ব্রডকাস্ট করতে পারেন; দেখুন [ইভেন্ট](#ইভেন্ট)।

---

## রাউট ম্যাপিং (ফাংশনাল স্টাইল)

কন্ট্রোলার ক্লাস ছাড়া সাধারণ রাউটের জন্য:

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

ফাংশনাল রাউটে মিডলওয়্যার এবং OpenAPI ডকুমেন্টেশন যোগ করুন:

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

ফাংশনাল রাউটে অথেনটিকেশন, `@Authorized` চেক বা DTO
ভ্যালিডেশন চলে না।

---

## টেস্টিং

ডিপেন্ডেন্সি ইনজেক্ট করা অবস্থায় সরাসরি একটি কন্ট্রোলার রিজলভ করুন:

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

অথবা কোনো পোর্ট বাইন্ড না করেই আসল রাউটগুলো চালিয়ে দেখুন:

```typescript
const app = MeghTest.createTestApplication({ controllers: [UserController] });

const res = await app.get("/users");
expect(res.statusCode).toBe(200);

const invalid = await app.post("/users", { payload: { unknown: true } });
expect(invalid.statusCode).toBe(400);
```

`get`, `post`, `put`, `patch`, `delete` এবং `options` সবগুলোই পাওয়া যায়, প্রতিটি
Fastify-এর inject অপশন (`payload`, `headers`, `query`, …) নেয়।

কোনো কন্ট্রোলারের প্রয়োজন হলে স্টাব ডিপেন্ডেন্সিগুলো অবস্থান অনুযায়ী (positionally) পাস করুন:

```typescript
const controller = MeghTest.getController(UserController, [mockUserService]);
```

Redis ছাড়াই জব ডিসপ্যাচ করে এমন কোড টেস্ট করতে `memory` বা `sync` [কিউ ড্রাইভার](#কিউ-ও-ওয়ার্কার)
ব্যবহার করুন।

---

## প্রোডাকশন

- `NODE_ENV=production` সেট করুন। সেট না থাকলেও প্রোডাকশন হিসেবে গণ্য হয়, তবে স্পষ্টভাবে সেট করাই ভালো।
  প্রোডাকশন মোডে 5xx-এর বিস্তারিত লুকানো থাকে, JSON লগ লেখা হয়, এবং
  `app.isDevelopment()` false হয়।
- `app.run(port)`-এর ডিফল্ট পোর্ট 4000। এটি `SIGTERM`/`SIGINT` হ্যান্ডল করে,
  বন্ধ হওয়ার আগে শিডিউলার থামিয়ে এবং রেজিস্টার করা ওয়ার্কারগুলো বন্ধ করে।
- `@Authorized` ব্যবহার করলে একটি authorizer রেজিস্টার করুন; সেটি না থাকলে ওই রাউটগুলো
  403 রিটার্ন করে।

---

## 0.3-এ আপগ্রেড করা

| ক্ষেত্র | পরিবর্তন |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ডিপেন্ডেন্সি | `@fastify/cors`, `@fastify/multipart`, `@fastify/static`, `@fastify/swagger`, `@fastify/swagger-ui`, `@scalar/fastify-api-reference`, `fastify-socket.io`, `class-validator`, `class-transformer` এবং `pino-pretty` এখন peer ডিপেন্ডেন্সি। আপনি যেগুলো ব্যবহার করেন সেগুলো ইনস্টল করুন ([টেবিল](#ঐচ্ছিক-ডিপেন্ডেন্সি))। |
| প্যাকেজ | শুধু CommonJS, একটি `exports` ম্যাপসহ। ডিপ ইমপোর্ট (`@meghjs/core/dist/...`) আর রিজলভ হয় না। লাইসেন্স এখন MIT। |
| এনভায়রনমেন্ট | `isDevelopment()`-এর জন্য `NODE_ENV=development` প্রয়োজন; সেট না থাকলে এখন প্রোডাকশন বোঝায়। |
| অথরাইজেশন | `@Authorized` ডিফল্টভাবে অনুমতি দেয় না (deny-by-default)। যে authorizer `false` রিটার্ন করে, সেটি এখন অনুমতি প্রত্যাখ্যান করে। `AuthorizeMiddleware`, `AppAuthorization`, `AuthHandler` এবং `AuthReturnTypes` সরিয়ে ফেলা হয়েছে। একটি `authorize()` মেথডসহ সাধারণ `@CanAuthorize` ক্লাস ব্যবহার করুন। |
| ভ্যালিডেশন | অজানা DTO প্রপার্টি 400 দিয়ে প্রত্যাখ্যান করা হয়। হ্যান্ডলারগুলো DTO ইনস্ট্যান্স পায়। এররের বডি এখন `{ code, status, message, errors[] }` (আগে ছিল `{ code, error: "ValidationError", errors }`)। |
| পেজিনেশন | সব paginator `{ data, meta: { total, page, perPage, lastPage, next, prev } }` রিটার্ন করে এবং `{ page, perPage }` নেয়। |
| ফাইল স্টোরেজ | ডিফল্টভাবে র‍্যান্ডম ফাইলনেম, `overwrite: false`, এক্সটেনশন allowlist এবং 50 MB সীমা। `save` অপশনে `saveAs` ব্যবহার হয় (`as` নয়)। `download`/`downloadAs`/`getUploadFile` পাথগুলো `baseDir`-এর সাপেক্ষে রিজলভ করে। `UploadFileFromRequest`-এর `dest` এখন একটি স্ট্রিং পাথ। |
| ইভেন্ট | `dispatch` একটি `MeghEvent` ইনস্ট্যান্স নেয়। Kafka এবং RabbitMQ broadcast এক্সেপশন থ্রো করে। Socket broadcast-এর জন্য `useSocketIo()` প্রয়োজন। `getListeners` একটি ক্লাস বা ইভেন্ট নেয়, এবং `flushOnce` সরিয়ে ফেলা হয়েছে। |
| কিউ | `@MeghWorker` আর ইমপোর্টের সময় চালু হয় না; `app.useWorker([...])` দিয়ে রেজিস্টার করুন। |
| ক্যাশ | মেমোরি স্টোর প্রতিটি ইনস্ট্যান্সের জন্য আলাদা এবং TTL কার্যকর করা হয়। |
| লগিং | ডিফল্টভাবে JSON; pretty শুধু ডেভেলপমেন্টে, `pino-pretty` ইনস্টল থাকলে। |
| Results | `Results.Ok(x)` এখন `{ headers, data, statusCode }` হিসেবে সিরিয়ালাইজ হয়। |
| সরানো এক্সপোর্ট | `registerKnex`, `FEATURE_KEY`, `uuid`, `getLineNumber`, `MatchLocation`, `extrctParamFromUrl`, `findDuplicates`, `isClassValidator`, `validateRequestBody`, `OkOptions`, `Results.code`, `KafkaBroadcastOption`, `RabbitMqBroadcastOption`, এবং `ControllerOptions.version`/`since`/`meta`। |

---

## 0.3.0-এর জানা সমস্যাসমূহ

এগুলো 0.3.0-এর রিগ্রেশন বা ঘাটতি, যেগুলো একটি প্যাচ রিলিজে ঠিক হওয়ার কথা:

- **`@UseMiddleware(SomeClass)` `app.run()`-কে ক্র্যাশ করায়।** একটি ইনস্ট্যান্স পাস করুন,
  `@UseMiddleware(new SomeClass())`, অথবা `app.useMiddlewares()` ব্যবহার করুন।
- **স্পষ্ট constructor ছাড়া `@Repository` এবং `@Queue` ক্লাস ডিপেন্ডেন্সি
  ইনজেকশনের অধীনে ভেঙে যায়।** `constructor() { super(); }` যোগ করুন।
- **`Results.Created`, `Results.NoContent`,
  `Results.NotFound`, `HttpResponse.Created` এবং `@HttpCode`-এর স্ট্যাটাস কোড প্রয়োগ হয় না।**
  রেসপন্স 200 হয়। এরর স্ট্যাটাস পাঠাতে `HttpExceptions` থ্রো করুন।
- **জেনারেট করা OpenAPI ডকুমেন্টে `@Body()`/`@Query()` DTO অনুপস্থিত।**
  ভ্যালিডেশন তবুও চলে। আপাতত `@OpenApi({ requestBody, query })` দিয়ে
  এগুলো বর্ণনা করুন।
- **`@All()` `app.run()`-কে ক্র্যাশ করায়।**
- **আপলোড পলিসি লঙ্ঘনে 500 রিটার্ন হয়**, 400 বা 413 নয়।
- **`app.run()`-এ কোনো `host` অপশন নেই।** সার্ভার localhost-এ বাইন্ড হয়।

---

## 1.0.0-এর রোডম্যাপ

1.0.0 হবে স্থিতিশীল API-সহ প্রথম রিলিজ: এর পরে, ব্রেকিং পরিবর্তনগুলো 2.0-এর জন্য
অপেক্ষা করবে। এই তালিকাগুলো দেখায় কী কী যুক্ত হয়েছে এবং কী এখনও 1.0.0-কে আটকে রেখেছে।

### সম্পন্ন

**নিরাপত্তা**

- [x] `@Authorized` ডিফল্টভাবে অনুমতি দেয় না, এবং `false` রিটার্ন করা authorizer 403 দেয়
- [x] হ্যান্ডলারগুলো ভ্যালিডেট করা DTO পায়; অজানা প্রপার্টি প্রত্যাখ্যান করা হয় (mass-assignment সুরক্ষা)
- [x] ফাইল স্টোরেজ প্রতিটি read, write এবং delete `baseDir`-এর মধ্যে সীমাবদ্ধ রাখে, sibling-prefix এবং symlink এস্কেপসহ
- [x] আপলোড করা ফাইল র‍্যান্ডম নাম পায়, ওভাররাইট করে না, এবং একটি এক্সটেনশন allowlist ও সাইজ সীমার বিপরীতে যাচাই করা হয়
- [x] `UploadFileFromRequest`-এ path traversal বন্ধ করা হয়েছে
- [x] `Content-Disposition` হেডার ইনজেকশন বন্ধ করা হয়েছে
- [x] ক্রেডেনশিয়াল আর লগ করা হয় না, এবং প্রোডাকশন 5xx-এর বিস্তারিত লুকায় ও ডেভ মোডের জন্য `NODE_ENV=development` প্রয়োজন
- [x] একসাথে চলা রিকোয়েস্টগুলো আর `FileStorage`-এর transform সেটিং শেয়ার করে না

**সঠিকতা**

- [x] বিল্ট-ইন `Validator` `0` গ্রহণ করে এবং `min` / `max` / `exact` / `optional` কার্যকর করে
- [x] ডেকোরেটর মেটাডেটা অনুপস্থিত থাকলে (tsx, esbuild, SWC) আর ক্র্যাশ হয় না; `@Body({ type })` টাইপ সরবরাহ করে
- [x] TypeORM কোয়েরি অপারেটর রানটাইমে কাজ করে
- [x] `MeghRepository.transaction()` ট্রানজ্যাকশনের ভেতরে চলে, এবং `useTypeORM()`-এর পরে `@InjectRepository` কাজ করে
- [x] Collection সংশোধন: `paginate`, `min`, `findAsync`
- [x] Collection, TypeORM এবং Knex জুড়ে একটিই পেজিনেশন কাঠামো
- [x] ক্লাস দিয়ে চিহ্নিত ইভেন্ট, ঠিক একবার চলা `once` লিসেনার, কিউতে থাকলে `delay` মানা হয়, ব্যর্থ জব রাখা হয়
- [x] শিডিউলার ডেকোরেটর আর প্যারেন্ট ক্লাসে ছড়িয়ে পড়ে না
- [x] ইন-মেমোরি ক্যাশ TTL কার্যকর করে; Redis ট্যাগ সেটের মেয়াদ শেষ হয়
- [x] প্রোডাকশনে JSON লগ; ফ্রেমওয়ার্কের লগ `LoggerService`-এর মাধ্যমে যায়
- [x] ক্লাস ইনস্ট্যান্সিয়েট না করেই OpenAPI কম্পোনেন্ট স্কিমা জেনারেট হয়

**ফিচারসমূহ**

- [x] শুধু প্রডিউসার কিউ (`worker: false`) এবং এমন ওয়ার্কার যেগুলো আর ইমপোর্টের সময় চালু হয় না
- [x] টেস্টের জন্য ইন-মেমোরি `memory` এবং `sync` কিউ ড্রাইভার
- [x] `Results.Created` / `NoContent` / `OkStream` এবং `@HttpCode` API (এখনও প্রয়োগ হয় না; নিচে দেখুন)

**প্যাকেজিং এবং টুলিং**

- [x] একটি `exports` ম্যাপ এবং `sideEffects`-সহ শুধু CommonJS বিল্ড
- [x] ইন্টিগ্রেশনগুলো ঐচ্ছিক peer ডিপেন্ডেন্সিতে সরানো হয়েছে
- [x] 1.0-এর জন্য typedi-কে `MeghContainer`-এর পেছনে রাখা; পরবর্তী কোনো minor রিলিজে এটি বদলানো যেতে পারে
- [x] MIT লাইসেন্স ফাইল `package.json`-এর সাথে মেলে
- [x] rimraf ছাড়া বিল্ড, ESLint/Jest কনফিগ ঠিক করা, husky 9, ডিফল্টভাবে কভারেজ বন্ধ
- [x] Node 22 এবং 24-এ CI (typecheck, lint, test, build) এবং ট্যাগ-ভিত্তিক publish ওয়ার্কফ্লো
- [x] রিকোয়েস্ট-পাইপলাইন ইন্টিগ্রেশন টেস্ট

**ডকুমেন্টেশন**

- [x] বর্তমান API-এর জন্য README এবং ডকুমেন্টেশন সাইট নতুন করে লেখা হয়েছে, একটি আপগ্রেড গাইডসহ
- [x] নতুন পেজ: অথেনটিকেশন, ফাইল আপলোড, ক্যাশিং, লগিং
- [x] ডকুমেন্টেশন সাইট VitePress-এ সরানো হয়েছে, টেমপ্লেট লিংক সরানো হয়েছে এবং বানান ভুল ঠিক করা হয়েছে

### 1.0.0-এর জন্য বাকি

**0.3.0-এর রিগ্রেশন** ([জানা সমস্যাসমূহ](#030-এর-জানা-সমস্যাসমূহ) দেখুন)

- [ ] `@UseMiddleware(SomeClass)` বুট ক্র্যাশ করায়
- [ ] constructor ছাড়া `@Repository` / `@Queue` ক্লাস DI-এর অধীনে ভেঙে যায়
- [ ] `Results`, `HttpResponse.Created` এবং `@HttpCode`-এর স্ট্যাটাস কোড প্রয়োগ করা
- [ ] `@Body()` / `@Query()` DTO স্কিমা আবার OpenAPI ডকুমেন্টে যুক্ত করা
- [ ] আপলোড পলিসি লঙ্ঘনে 500 নয়, 400 / 413 রিটার্ন করা উচিত

**মূল সঠিকতা**

- [ ] `useScheduler({ path })` `run()`-কে ক্র্যাশ করায় (ভুল `require` পাথ)
- [ ] `@UploadFile` / `@UploadFiles` `saveRequestFiles()`-এর জন্য await করে না
- [ ] `@All()` রেজিস্ট্রেশনের সময় ক্র্যাশ করে
- [ ] HTTP-এক্সেপশন নয় এমন এররের ক্ষেত্রে `error.statusCode` (401, 413, 415, 429, …) মেনে চলা
- [ ] একটি সামঞ্জস্যপূর্ণ মিডলওয়্যার ক্রম; `@UseMiddleware` DI-এর মাধ্যমে রিজলভ করা
- [ ] রাউট মেটাডেটা ক্যাশ `constructor.name` দিয়ে চিহ্নিত, তাই একই নামের ক্লাসগুলোর মধ্যে সংঘর্ষ হয়
- [ ] কন্ট্রোলার খুঁজে বের করা: `_resolveControllerDir` তার আর্গুমেন্ট উপেক্ষা করে এবং পাথের প্রথম `src` পুনর্লিখন করে; বারবার `useControllers` কল একে অপরকে ওভাররাইট করে
- [ ] ফাংশনাল রাউট: `mapPatch` যোগ করা, এবং অথেনটিকেশন, DI ও স্ট্যান্ডার্ড এরর কাঠামো চালু করা
- [ ] `run()`-এর `host` অপশন (কন্টেইনারে ডিফল্ট `0.0.0.0`)
- [ ] গ্রেসফুল শাটডাউন: `process.exit(0)`-এর বদলে `app.close()` এবং একটি drain টাইমআউটসহ TypeORM, Knex, Redis ও Socket.IO বন্ধ করা
- [ ] `PartialType` / `OmitType` / `PickType` class-validator নিয়মগুলো সঠিকভাবে বহন করে না
- [ ] Scalar `spec.content` স্পেকের বদলে প্লাগইন মডিউল রিটার্ন করে
- [ ] `Environment` প্রতিটি `get()`-এ `.env` আবার পড়ে, এবং `dotenv` ইমপোর্টের সময় লোড হয়
- [ ] Socket হ্যান্ডলারের এরর unhandled rejection হয়ে যায়
- [ ] `@MeghWorker`-এর `autoStart` অ্যাপ বুটের সাথে যুক্ত নয়
- [ ] ঐচ্ছিক peer হওয়া সত্ত্বেও `class-validator` / `class-transformer` ইমপোর্টের সময় লোড হয়

**অনুপস্থিত ফিচার**

- [ ] `use*` অপশন হিসেবে সিকিউরিটি হেডার (helmet) এবং রেট লিমিটিং
- [ ] হেলথ এবং রেডিনেস এন্ডপয়েন্ট
- [ ] লগে রিকোয়েস্ট ID, এবং লগারকে Fastify-এর সাথে যুক্ত করা
- [ ] হ্যান্ডলার থেকে রিডাইরেক্ট এবং রেসপন্স হেডার
- [ ] প্লাগযোগ্য এরর হ্যান্ডলার / এক্সেপশন ফিল্টার
- [x] লাইফসাইকেল হুক (`onInit`, `onReady`, `onClose`, `app.close()`)
- [ ] বুটের সময় কনফিগ স্কিমা ভ্যালিডেশন
- [ ] গ্লোবাল রাউট প্রিফিক্স এবং API ভার্সনিং
- [ ] কম্প্রেশন
- [ ] Socket.IO হ্যান্ডশেক অথেনটিকেশন এবং প্রতি-চ্যানেল অথরাইজেশন

**API পরিচ্ছন্নকরণ** (1.0-এর API একটি প্রতিশ্রুতি)

- [ ] নো-অপ `useHttps()`, `useSerialization()` এবং `mapFeatures()` সম্পূর্ণ করা বা সরিয়ে ফেলা
- [x] TypeORM এবং Knex-কে `@meghjs/data` প্লাগইনে সরানো, এবং অপ্রচলিত `useDatasource()` সরিয়ে ফেলা
- [ ] `MeghSocketIo` স্টাব এবং অব্যবহৃত অ্যাডাপ্টার টাইপ সরিয়ে ফেলা
- [ ] `KnexHooks` / `KnexHooksFactory`, `DuplicateRouteException`, `mapRoute()` এবং `registerMiddleware()` সরিয়ে ফেলা
- [x] পাবলিক index থেকে `mock-db` এক্সপোর্ট বন্ধ করা, এবং Jest টাইপ ছাড়া বিল্ড করা
- [ ] বাকি `console.log` কলগুলো লগার দিয়ে প্রতিস্থাপন করা

**টেস্ট**

- [ ] `application.ts`: `run()`, শাটডাউন, কন্ট্রোলার স্বয়ংক্রিয়ভাবে খুঁজে বের করা, `useScheduler({ path })`
- [ ] ইভেন্ট, শিডিউলার, ওয়ার্কার, Redis ক্যাশ, `testing.ts`, `map-types.ts`, কনফিগ
- [ ] ফাঁপা টেস্ট এবং `MeghTest` ঠিক করা (`from()` race, গ্লোবাল কন্টেইনার মিউটেশন)
- [ ] কভারেজ থ্রেশহোল্ড

**CLI** (`@meghjs/cli`, পুনর্লিখন চলছে)

- [ ] commander-ভিত্তিক পুনর্লিখন সম্পূর্ণ করা: `--help` / `--version`, সামঞ্জস্যপূর্ণ ফ্ল্যাগ ও নামকরণ, বিদ্যমান প্রজেক্ট ওভাররাইট করতে অস্বীকার করা
- [ ] জেনারেট করা কোড `@meghjs/core`-এর বিপরীতে কম্পাইল হয়
- [ ] CLI টেস্ট (প্রতিটি `make:*` কমান্ডের জন্য স্ন্যাপশট)
- [ ] core-এর সাথে মিলিয়ে ভার্সনসহ রিলিজ

**ডকুমেন্টেশন এবং রিলিজ**

- [ ] কনফিগারেশন, শিডিউলার, টেস্টিং, ডিপেন্ডেন্সি ইনজেকশন, রেসপন্স, ডিপ্লয়মেন্ট এবং সিকিউরিটি হার্ডেনিং-এর জন্য পেজ
- [ ] API রেফারেন্স এবং FAQ
- [ ] কন্ট্রিবিউটর গাইড: প্রজেক্ট কাঠামো, এবং CLI-জেনারেটেড কোড যে এক্সপোর্টগুলোর ওপর নির্ভর করে
- [ ] core, CLI এবং ডকুমেন্টেশন জুড়ে চেঞ্জলগ এবং একটি ভার্সনিং নীতি

---

## রিপোজিটরির গঠন

এই মনোরিপোতে প্রতিটি Megh প্যাকেজ এবং ডকস সাইটের সোর্স রাখা আছে, যাতে ফ্রেমওয়ার্ক, এর CLI টেমপ্লেট এবং এর ডকুমেন্টেশনের পরিবর্তন একটি কমিটেই যুক্ত করা যায়।

| ফোল্ডার           | প্যাকেজ / সাইট                                                | যেখান থেকে প্রকাশিত হয়                                                                 |
|------------------|---------------------------------------------------------------|--------------------------------------------------------------------------------|
| `packages/core/` | [`@meghjs/core`](https://www.npmjs.com/package/@meghjs/core)  | এই রিপোজিটরি (Lerna)                                                        |
| `packages/cli/`  | [`@meghjs/cli`](https://www.npmjs.com/package/@meghjs/cli)    | এই রিপোজিটরি (Lerna)                                                        |
| `packages/data/` | [`@meghjs/data`](https://www.npmjs.com/package/@meghjs/data)  | এই রিপোজিটরি (Lerna)                                                        |
| `docs/`          | https://meghjs.github.io (VitePress)                        | [meghjs/meghjs.github.io](https://github.com/meghjs/meghjs.github.io)  |
| `resources/`     | লোগো এবং ফেভিকন                                            | প্রযোজ্য নয়                                                                            |
| `scripts/`       | `mirror.sh`, যা `docs/`-কে এর আলাদা রিপোজিটরির সাথে সিঙ্ক করে       | প্রযোজ্য নয়                                                                            |

`1.0-CHECKLIST.md` 1.0 রিলিজের কাজের হিসাব রাখে; বর্তমান রোডম্যাপ নিচে [1.0.0 পর্যন্ত রোডম্যাপ](#100-এর-রোডম্যাপ)-এ দেওয়া আছে।

`packages/*` হলো [Lerna](https://lerna.js.org) দিয়ে পরিচালিত npm ওয়ার্কস্পেস: রুটে একটিমাত্র লকফাইল থাকে, এবং `packages/cli` `@meghjs/core`-কে লোকাল সোর্স থেকে রিজলভ করে। `packages/`-এর প্রতিটি প্যাকেজ npm-এ প্রকাশিত হয়, যদি না তার `package.json`-এ `"private": true` থাকে। নতুন কোনো অভ্যন্তরীণ লাইব্রেরির জন্য শুধু `packages/`-এর অধীনে একটি স্কোপড নামসহ (`@meghjs/...`) ফোল্ডার এবং `"publishConfig": { "access": "public" }` প্রয়োজন। `docs/` কোনো ওয়ার্কস্পেস নয় এবং এর নিজস্ব লকফাইল আছে।

---

## Megh-এ কাজ করা

প্রয়োজনীয়তা: Node.js 22.22+ অথবা 24.15+ (Lerna 10-এর জন্য দরকার), npm এবং git। প্রকাশিত প্যাকেজগুলো Node.js 22 এবং এর নতুন ভার্সন সাপোর্ট করে, এবং CI এগুলোকে Node.js 22 ও 24-এ টেস্ট করে।

```bash
npm run setup       # npm ci at the root (all packages) and in docs
npm run build       # build every package (lerna run build)
npm run typecheck
npm test            # every package's tests
npm run lint        # core
npm run docs:dev    # docs site at http://localhost:5173
npm run docs:build  # fails on dead links
```

প্রতিটি প্যাকেজে সরাসরিও কাজ করা যায়, যেমন `cd packages/core && npm test`, অথবা `npx lerna run test --scope @meghjs/core` দিয়ে। ডিপেন্ডেন্সি প্যাকেজের ভেতর থেকে নয়, রুট থেকে `npm install <dep> -w @meghjs/core` দিয়ে ইনস্টল করুন।

জেনারেট করা কোনো অ্যাপে `core`-এর লোকাল পরিবর্তন পরীক্ষা করতে, `packages/core/`-এ `npm run build` চালান, তারপর অ্যাপে `npm install <path-to>/packages/core` চালান।

---

## প্রকাশ ও ডিপ্লয়মেন্ট

সব প্যাকেজ একই ভার্সন শেয়ার করে (Lerna fixed mode, `lerna.json`-এ) এবং `main` থেকে একসাথে রিলিজ করা হয়:

```bash
npm run release     # lerna version
```

`lerna version` শেষ `v*` ট্যাগের পর থেকে conventional commit-গুলো দেখে পরবর্তী ভার্সন নির্ধারণ করে (`fix:` হলো patch, `feat:` হলো minor, `BREAKING CHANGE` হলো major), প্রতিটি প্যাকেজের ভার্সন বাড়ায়, প্রতিটি `CHANGELOG.md` লেখে, `chore(release): vX.Y.Z` কমিট করে, এবং কমিট ও ট্যাগ পুশ করে। ভার্সন ওভাররাইড করতে একটি ভার্সন দিন, যেমন `npm run release -- 0.4.0`।

`v*` ট্যাগটি `.github/workflows/release.yml` চালু করে। এটি সবকিছু টাইপ-চেক, লিন্ট, টেস্ট ও বিল্ড করে, তারপর `lerna publish from-package` চালায়, যা provenance সহ এমন প্রতিটি পাবলিক প্যাকেজ প্রকাশ করে যার ভার্সন এখনো npm-এ নেই। এর জন্য এই রিপোজিটরিতে একটি `NPM_TOKEN` সিক্রেট প্রয়োজন।

ডকস সাইট এখনো তার আলাদা রিপোজিটরি থেকে ডিপ্লয় হয়। `npm run mirror` `git subtree split` ব্যবহার করে `docs/`-এর হিস্ট্রি [meghjs/meghjs.github.io](https://github.com/meghjs/meghjs.github.io)-এ পুশ করে, যা https://meghjs.github.io ডিপ্লয় করে। ওই রিপোজিটরিতে শুধুমাত্র `mirror.sh`-এর মাধ্যমে কমিট করুন: সেখানে সরাসরি কোনো কমিট করলে সেটি মনোরিপোতে আনা না হওয়া পর্যন্ত পরবর্তী পুশ ব্যর্থ হবে।

---

## রিলিজ ও ভার্সনিং

- **Semver।** প্যাচ রিলিজ বাগ ঠিক করে। মাইনর রিলিজ ব্যাকওয়ার্ড-কম্প্যাটিবল ফিচার যোগ করে। ব্রেকিং পরিবর্তনগুলো পরবর্তী মেজর রিলিজের জন্য অপেক্ষা করে এবং তার আগে অন্তত একটি মাইনর রিলিজে (সতর্কবার্তাসহ) ডেপ্রিকেটেড থাকে, যদি না পরিবর্তনটি কোনো নিরাপত্তা সমস্যা ঠিক করে।
- **রিলিজের ক্রম।** `core` এবং `cli` একই ভার্সনে একসাথে রিলিজ করা হয়। এরপর `docs`-এ ভার্সন আপডেট করুন।

---

## নিরাপত্তা

অনুগ্রহ করে দুর্বলতাগুলো পাবলিক ইস্যুতে না জানিয়ে ব্যক্তিগতভাবে মেইনটেইনারকে ([GitHub @xtareq](https://github.com/xtareq)) জানান।

---

## লাইসেন্স

MIT © [Tareq Hossain](https://github.com/xtareq)
