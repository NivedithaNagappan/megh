---
title: AI Integration
description: Calling LLM providers from a Megh app.
---

# AI Integration

::: warning
Megh does not ship an AI integration yet. There is no `@meghjs/core` API for
LLM providers at this time — this page is a placeholder for planned work.
:::

In the meantime you can call any provider's SDK directly from a service, the
same as any other outbound HTTP dependency:

```ts [services/summary.service.ts]
import { AppService } from '@meghjs/core';

@AppService
export class SummaryService {
  async summarize(text: string) {
    // call your provider's SDK here
    return { summary: text.slice(0, 120) };
  }
}
```

Long-running generations are a good fit for a [queue](/advanced/queue), so the
request does not block on the model, and [events](/advanced/events) can notify
clients over websockets when a result is ready.
