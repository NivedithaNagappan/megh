---
title: Caching
description: In-memory and Redis caching with tags.
---

# Caching

Enable the cache on the app. It is in-memory by default:

```ts [app.ts]
app.useCache({ provider: 'memory' });
```

For Redis, install `ioredis` and pass its options:

```ts
app.useCache({
  provider: 'redis',
  redisOptions: { host: '127.0.0.1', port: 6379 },
});
```

## Using the cache

Inject `CacheManager`. `set` takes a key, a value, a TTL in seconds, and
optional tags:

```ts [services/users.service.ts]
import { AppService, CacheManager } from '@meghjs/core';

@AppService
export class UsersService {
  constructor(private readonly cache: CacheManager) {}

  async findAll() {
    const cached = await this.cache.get<User[]>('users:all');
    if (cached) return cached;

    const users = await this.repo.find();
    await this.cache.set('users:all', users, 3600, ['users']);
    return users;
  }

  async update(user: User) {
    await this.repo.save(user);
    await this.cache.invalidateTags('users'); // drops every key tagged 'users'
  }
}
```

## Expiry

- A TTL of `0` or less means the entry never expires.
- The memory store drops expired entries when they are read, and in a
  background sweep every 60 seconds. The sweep does not keep the process alive.
- The memory store has no size limit, so give large or numerous entries a TTL.
- In Redis, tag sets expire no earlier than the longest-lived key they track.

## Instances

The `CacheManager` registered by `useCache` is a singleton shared through
dependency injection. `new CacheManager(options)` creates an independent store,
which is useful in tests:

```ts
const cache = new CacheManager({ provider: 'memory', sweepIntervalMs: 1000 });
cache.sweep();         // remove expired entries now; returns how many
await cache.close();   // stop the sweep timer and release resources
```

Call `await CacheManager.close()` on shutdown to close every instance,
including the Redis client.
