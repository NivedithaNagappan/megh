---
title: Events
description: Dispatching and handling events in a Megh application.
---

# Events

Events let one part of your application announce that something happened
without knowing who reacts to it. Megh's event system is typed, supports
synchronous, delayed and queued delivery, and can broadcast over Socket.IO.

## Defining an event

An event extends `MeghEvent<TPayload>`. The payload type is yours; the base
class fills in `name` and `timestamp`.

```ts [events/user-created.event.ts]
import { MeghEvent } from '@meghjs/core';

export type UserCreatedPayload = {
  userId: number;
  name: string;
};

export class UserCreatedEvent extends MeghEvent<UserCreatedPayload> {}
```

## Defining a listener

A listener extends `MeghEventListener<TEvent>` and implements `handler`. It
may be synchronous or return a promise.

```ts [listeners/user-created.listener.ts]
import { MeghEventListener } from '@meghjs/core';
import { UserCreatedEvent } from '../events/user-created.event';

export class UserCreatedListener extends MeghEventListener<UserCreatedEvent> {
  async handler(event: UserCreatedEvent): Promise<void> {
    console.log(`User created → id=${event.payload.userId}, name=${event.payload.name}`);
  }
}
```

## Registering listeners

`EventRegistry` is a singleton. Register listeners once during app setup.

```ts [app.ts]
import { EventRegistry } from '@meghjs/core';
import { UserCreatedEvent } from './events/user-created.event';
import { UserCreatedListener } from './listeners/user-created.listener';

const registry = EventRegistry.getInstance();

registry.register(UserCreatedEvent, new UserCreatedListener());
```

An event may have several listeners — they run in registration order.

Use `once` for a listener that should fire a single time and then be discarded:

```ts
registry.once(UserCreatedEvent, {
  handler(event: UserCreatedEvent) {
    console.log(`Sending welcome email to ${event.payload.name}`);
  },
});
```

## Dispatching

```ts [services/user.service.ts]
import { AppService, EventDispatcher } from '@meghjs/core';
import { UserCreatedEvent } from '../events/user-created.event';

@AppService
export class UserService {
  private readonly dispatcher = new EventDispatcher();

  async create(name: string) {
    const userId = 1; // ...persist the user

    await this.dispatcher.dispatch(new UserCreatedEvent({ userId, name }));

    return { userId, name };
  }
}
```

By default listeners run synchronously, in the current tick, before `dispatch`
resolves.

### Queued delivery

Pass `queue: true` to hand the event to the in-memory queue instead. Listener
failures are then retried:

```ts
await dispatcher.dispatch(new UserCreatedEvent({ userId: 1, name: 'Tareq' }), {
  queue: true,
  retry: 3,
  retryDelay: 500, // milliseconds between attempts
});
```

`retry` and `retryDelay` are only accepted together with `queue: true`.

Jobs that still fail after their last retry are kept, up to 1000 of them, and
logged:

```ts
import { EventQueue } from '@meghjs/core';

const queue = EventQueue.getInstance();
const failed = queue.getFailedJobs(); // FailedEventJob[]
queue.clearFailed();
await queue.whenIdle();               // useful in tests
```

### Delayed delivery

`delay` takes milliseconds or a duration string: `'500ms'`, `'5s'`, `'2m'`,
`'1h'`, `'1d'`. It also works together with `queue: true`.

```ts
await dispatcher.dispatch(new UserCreatedEvent({ userId: 1, name: 'Tareq' }), {
  delay: '5s', // fire listeners 5 seconds from now
});
```

### Broadcasting

Add a `broadcast` option to forward the event to Socket.IO as well as to the
local listeners. Clients receive `{ name, payload }` on the channel:

```ts
await dispatcher.dispatch(event, {
  broadcast: { type: 'socket', channel: 'user:create', room: 'admins' },
});
```

Socket broadcast needs `app.useSocketIo()`. Without it, `dispatch` rejects and
the local listeners do not run.

::: warning
Kafka and RabbitMQ broadcast are not implemented in 0.3.
`type: 'kafka'` and `type: 'rabbitmq'` throw.
:::

::: info
A listener that throws is logged and does not stop the other listeners for that
event. With `queue: true`, the failure is retried according to `retry`.
:::

### Listener registry

- Listeners are keyed by the event **class**, so two event classes with the same
  name do not collide.
- `once` listeners fire exactly once, even when the event is dispatched
  concurrently.
- `registry.getListeners(UserCreatedEvent)` takes the class or an event
  instance. `registry.clear(UserCreatedEvent)` removes its listeners, and
  `registry.clear()` removes all of them.
