# Contributing to Megh

Thanks for helping improve Megh. This guide covers how to set up the repo, make
a change and get it merged.

## Ground rules

- `main` is protected. Nobody pushes to it directly. Every change goes in
  through a pull request.
- A PR can be merged only when:
  - the **CI OK** check is green (build, type-check, lint, tests on Node 22
    and 24, plus the docs build),
  - the branch is up to date with `main`,
  - at least one maintainer has approved it, and all review threads are
    resolved.
- New pushes to a PR dismiss earlier approvals, so the final code is what gets
  reviewed.

## Repository layout

| Path             | What it is                                     |
| ---------------- | ---------------------------------------------- |
| `packages/core`  | `@meghjs/core`, the framework                  |
| `packages/data`  | `@meghjs/data`, database providers and MeghORM |
| `packages/cli`   | `@meghjs/cli`, the `megh` command line tool    |
| `docs/`          | The VitePress docs site (meghjs.github.io)     |
| `samples/`       | Example apps                                   |

## Setup

You need **Node.js 22.22 or newer** and npm.

```bash
git clone https://github.com/<your-username>/megh.git
cd megh
npm run setup        # npm ci for the workspaces and the docs site
npm run build        # @meghjs/data builds against core's dist
```

## Making a change

1. Fork the repo and create a branch from `main`:
   `git checkout -b fix/short-description`
2. Make the change. Add or update tests under `packages/<name>/tests` for
   anything that changes behaviour.
3. Run the same checks CI runs before you push:

   ```bash
   npm run build
   npm run typecheck
   npm run lint
   npm test
   npm run docs:build   # only if you touched docs/
   ```

4. Commit using [Conventional Commits](https://www.conventionalcommits.org).
   Releases and the changelog are generated from these messages.

   ```
   feat(core): add rate limit decorator
   fix(data): close the knex pool on shutdown
   docs: explain request validation
   chore: bump dev dependencies
   ```

   Use `feat!:` or a `BREAKING CHANGE:` footer for breaking changes.

5. Push your branch and open a pull request against `main`. Fill in the PR
   template.

A pre-commit hook (husky + lint-staged) formats staged files, runs ESLint and
runs related tests. Don't skip it with `--no-verify`. CI runs the full suite
anyway.

## If CI fails

Open the failed job on the PR's **Checks** tab, fix the problem locally and
push again. The PR updates by itself. If a failure looks unrelated to your
change, say so in the PR and a maintainer will take a look.

## Docs

Docs live in `docs/content`. Run `npm run docs:dev` to preview them. If your
change affects public behaviour, update the docs in the same PR.

## Releases

Maintainers handle releases. `npm run release` bumps the versions and pushes a
`v*` tag, and the Release workflow publishes to npm. Contributors don't need to
bump versions.

## Reporting bugs and security issues

Open a GitHub issue with steps to reproduce, the expected and actual behaviour,
and your Node and Megh versions. Report security vulnerabilities privately
through GitHub's **Report a vulnerability** button on the Security tab, not in
a public issue.
