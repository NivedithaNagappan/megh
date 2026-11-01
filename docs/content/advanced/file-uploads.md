---
title: File Uploads
description: Receiving and storing uploaded files safely.
---

# File Uploads

Multipart support is an optional peer dependency:

```sh
npm i @fastify/multipart
```

Enable it on the app:

```ts [app.ts]
app.useMultipart({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
});
```

## Receiving a file

`@UploadFile('field')` injects one file and `@UploadFiles()` injects all of
them. Save them with the injected `FileStorage`:

```ts [controllers/files.controller.ts]
import { ApiController, Post, UploadFile, MultipartFile, FileStorage } from '@meghjs/core';

@ApiController('/files')
export class FilesController {
  constructor(private readonly storage: FileStorage) {}

  @Post('/avatar')
  async upload(@UploadFile('file') file: MultipartFile) {
    return this.storage.save(file, { to: 'avatars' });
  }
}
```

`save` returns:

```json
{
  "filename": "3f9c0d0e-....png",
  "originalFilename": "me.png",
  "size": 48213,
  "uploadPath": "/uploads/avatars/3f9c0d0e-....png",
  "staticPath": "/static/avatars/3f9c0d0e-....png"
}
```

Both paths are relative to `baseDir`, with the prefixes `/uploads/` and
`/static/`.

## Safe defaults

`FileStorage` assumes uploads are untrusted:

| Default | Override |
|---------|----------|
| Saved under `<cwd>/public` | `configure({ baseDir })` |
| Random UUID filename that keeps the extension | `saveAs: 'name.png'` or `preserveFilename: true` |
| Never overwrites an existing file | `overwrite: true` |
| Only common safe extensions (images, PDF, office, text/CSV, zip, audio/video). HTML, SVG and JS are rejected | `allowedExtensions` |
| No MIME check | `allowedMimeTypes: ['image/*']` |
| 50 MB limit, enforced while streaming | `maxFileSize` |

Every path, including `to`, is confined to `baseDir`. Paths that try to escape
it, through `..` or a symlink, are rejected.

::: info
In 0.3.0, a file that breaks these rules gives a 500 response, not 400
or 413.
:::

## Configuring

Set the defaults once, for example in a service constructor or at startup:

```ts
storage.configure({
  baseDir: 'public/uploads',
  allowedMimeTypes: ['image/*'],
  maxFileSize: 5_000_000,
});
```

Override per call:

```ts
await storage.save(file, {
  to: 'documents',
  saveAs: 'contract.pdf',
  overwrite: true,
  allowedExtensions: ['.pdf'],
});

await storage.saveAll(files, { to: 'gallery' });
```

## Image transforms

With `sharp` installed, resize or convert images as they are saved. The
extension follows the output format:

```ts
await storage.save(file, {
  to: 'avatars',
  transform: { resize: { width: 256, height: 256 }, format: 'webp' },
});
```

`storage.transform({...})` returns a scoped copy of the storage with that
transform applied, so concurrent requests never share transform settings.

## Serving and removing files

`download`, `downloadAs`, `getUploadFile` and `remove` take paths **relative
to `baseDir`**. Anything outside it is rejected, and a missing file gives 404.

```ts
@Get('/:name')
download(@Param('name') name: string) {
  return this.storage.downloadAs(`documents/${name}`, name);
}
```

Download responses get a safely encoded `Content-Disposition` header.

To serve the upload directory as static files, see `useStaticFiles`
(requires `@fastify/static`):

```ts
app.useStaticFiles({ path: path.join(process.cwd(), 'public'), prefix: '/static/' });
```
