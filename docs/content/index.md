---
layout: home

hero:
  name: AVLEON
  text: TypeScript-first web framework built on Fastify
  tagline: Decorator-based routing, dependency injection, validation and OpenAPI docs, with minimal boilerplate.
  image:
    src: /avlogo.svg
    alt: Avleon
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/introduction
    - theme: alt
      text: Upgrading to 0.4
      link: /getting-started/upgrading-0.4
    - theme: alt
      text: GitHub
      link: https://github.com/avleonjs/avleon

features:
  - title: Decorator-based routing
    details: Controllers, route methods and parameter decorators, with DTOs validated and whitelisted by class-validator.
  - title: Secure by default
    details: Deny-by-default authorization, confined file storage and production-safe error responses.
  - title: Batteries included
    details: Type-safe models and migrations, TypeORM and Knex, events, BullMQ queues, scheduling, caching, Socket.IO and structured logging.
---

## Hello, Avleon

::: code-group
```ts [welcome.controller.ts]
import { ApiController, Get } from '@avleon/core';

@ApiController
export class WelcomeController {
  @Get()
  sayHello() {
    return 'Hello, Avleon!';
  }
}
```

```ts [app.ts]
import { Avleon } from '@avleon/core';
import { WelcomeController } from './welcome.controller';

const app = Avleon.createApplication();
app.useControllers([WelcomeController]);
app.run(); // or app.run(4000)
```
:::
