---
title: Introduction
description: What Megh is.
---

# Introduction

## Overview

Megh is a TypeScript-first web framework built on [Fastify](https://fastify.dev),
for building REST APIs with minimal boilerplate. It gives you:

- Decorator-based controllers and routes
- Dependency injection
- Request validation with class-validator DTOs
- Authentication and deny-by-default authorization
- Automatic OpenAPI documentation with Swagger UI or Scalar
- [Type-safe models and migrations](/advanced/orm) built on Kysely
- TypeORM and Knex integrations with one pagination shape
- Events, BullMQ queues, task scheduling and caching
- Socket.IO integration
- Structured logging and test utilities

Integrations are optional peer dependencies, so you install only what you use.

> **Coming from Avleon?** Avleon is now Megh. See
> [Moving from Avleon to Megh](/getting-started/upgrading-megh). On 0.3 or
> earlier, read [Upgrading to 0.4](/getting-started/upgrading-0.4) first.
