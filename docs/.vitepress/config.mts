import { defineConfig } from 'vitepress';

export default defineConfig({
  srcDir: 'content',
  title: 'Megh',
  description: 'A TypeScript-first web framework built on Fastify.',
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],

  themeConfig: {
    logo: '/megh-logo.svg',
    siteTitle: false,

    nav: [
      {
        text: 'Guide',
        link: '/getting-started/introduction',
        activeMatch: '^/(getting-started|core-concept|microservices|ai)/|^/advanced/(?!orm|database)',
      },
      { text: 'Database', link: '/advanced/orm', activeMatch: '^/advanced/(orm|database)' },
      { text: 'CLI', link: '/cli/basic', activeMatch: '^/cli/' },
      {
        text: 'v0.5.3',
        items: [
          { text: 'Upgrading to 0.5.3', link: '/getting-started/upgrading-0.5' },
          { text: 'Moving from Avleon', link: '/getting-started/upgrading-megh' },
          { text: 'Upgrading to 0.4', link: '/getting-started/upgrading-0.4' },
          { text: 'Upgrading to 0.3', link: '/getting-started/upgrading' },
          { text: 'Changelog', link: 'https://github.com/meghjs/megh/blob/main/packages/core/CHANGELOG.md' },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/getting-started/introduction' },
          { text: 'Installation', link: '/getting-started/installation' },
          { text: 'Quick Start', link: '/getting-started/usage' },
        ],
      },
      {
        text: 'Fundamentals',
        items: [
          { text: 'Controllers', link: '/core-concept/controller' },
          { text: 'Dependency Injection', link: '/core-concept/dependency-injection' },
          { text: 'Middleware', link: '/core-concept/middleware' },
          { text: 'Validation', link: '/core-concept/validation' },
          { text: 'Authentication', link: '/core-concept/authentication' },
        ],
      },
      {
        text: 'Database',
        items: [
          { text: 'MeghORM', link: '/advanced/orm' },
          { text: 'Models', link: '/advanced/orm/models' },
          { text: 'Queries', link: '/advanced/orm/queries' },
          { text: 'Relations', link: '/advanced/orm/relations' },
          { text: 'Query Builder', link: '/advanced/orm/query-builder' },
          { text: 'Migrations', link: '/advanced/orm/migrations' },
          { text: 'Seeding and Factories', link: '/advanced/orm/seeding' },
          { text: 'TypeORM and Knex', link: '/advanced/database' },
        ],
      },
      {
        text: 'Techniques',
        items: [
          { text: 'Events', link: '/advanced/events' },
          { text: 'Queue', link: '/advanced/queue' },
          { text: 'Caching', link: '/advanced/caching' },
          { text: 'File Uploads', link: '/advanced/file-uploads' },
          { text: 'Logging', link: '/advanced/logging' },
        ],
      },
      {
        text: 'Integrations',
        items: [
          { text: 'OpenAPI', link: '/microservices/openapi' },
          { text: 'WebSocket', link: '/microservices/websocket' },
          { text: 'AI', link: '/ai/integration' },
        ],
      },
      {
        text: 'Extending',
        items: [{ text: 'Plugins', link: '/advanced/plugins' }],
      },
      {
        text: 'CLI',
        items: [
          { text: 'Overview', link: '/cli/basic' },
          { text: 'Generators', link: '/cli/generators' },
          { text: 'Database Commands', link: '/cli/database' },
          {
            text: 'Scaffold',
            collapsed: false,
            items: [
              { text: 'Overview', link: '/cli/scaffold/' },
              { text: 'Templates and Fields', link: '/cli/scaffold/templates' },
              { text: 'Domains', link: '/cli/scaffold/domains' },
              { text: 'Auth', link: '/cli/scaffold/auth' },
              { text: 'RBAC', link: '/cli/scaffold/rbac' },
            ],
          },
        ],
      },
      {
        text: 'Upgrade Guides',
        collapsed: true,
        items: [
          { text: 'Upgrading to 0.5.3', link: '/getting-started/upgrading-0.5' },
          { text: 'Moving from Avleon', link: '/getting-started/upgrading-megh' },
          { text: 'Upgrading to 0.4', link: '/getting-started/upgrading-0.4' },
          { text: 'Upgrading to 0.3', link: '/getting-started/upgrading' },
        ],
      },
    ],

    outline: { level: [2, 3] },

    socialLinks: [{ icon: 'github', link: 'https://github.com/meghjs/megh' }],

    search: { provider: 'local' },

    editLink: {
      pattern: 'https://github.com/meghjs/meghjs.github.io/edit/main/content/:path',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Tareq Hossain',
    },
  },
});
