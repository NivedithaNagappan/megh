---
layout: home

hero:
  name: MEGH
  text: TypeScript-first web framework built on Fastify
  tagline: Decorator-based routing, dependency injection, validation and OpenAPI docs, with minimal boilerplate.
  image:
    src: /megh-logo.svg
    alt: Megh
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/introduction
    - theme: alt
      text: Moving from Avleon
      link: /getting-started/upgrading-megh
    - theme: alt
      text: GitHub
      link: https://github.com/meghjs/megh

features:
  - title: Decorator-based routing
    details: Controllers, route methods and parameter decorators, with DTOs validated and whitelisted by class-validator.
  - title: Secure by default
    details: Deny-by-default authorization, confined file storage and production-safe error responses.
  - title: Batteries included
    details: Type-safe models and migrations, TypeORM and Knex, events, BullMQ queues, scheduling, caching, Socket.IO and structured logging.
---

## Hello, Megh

::: code-group
```ts [welcome.controller.ts]
import { ApiController, Get } from '@meghjs/core';

@ApiController
export class WelcomeController {
  @Get()
  sayHello() {
    return 'Hello, Megh!';
  }
}
```

```ts [app.ts]
import { Megh } from '@meghjs/core';
import { WelcomeController } from './welcome.controller';

const app = Megh.createApplication();
app.useControllers([WelcomeController]);
app.run(); // or app.run(4000)
```
:::
