import { defineConfig } from 'vitepress';

export default defineConfig({
  srcDir: 'content',
  title: 'Avleon',
  description: 'A TypeScript-first web framework built on Fastify.',
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],

  themeConfig: {
    logo: '/avlogo.svg',

    nav: [
      { text: 'Guide', link: '/getting-started/introduction', activeMatch: '^/(getting-started|core-concept|advanced|microservices|ai)/' },
      { text: 'CLI', link: '/cli/basic', activeMatch: '^/cli/' },
      {
        text: 'v0.4.0',
        items: [
          { text: 'Upgrading to 0.4', link: '/getting-started/upgrading-0.4' },
          { text: 'Upgrading to 0.3', link: '/getting-started/upgrading' },
          { text: 'Changelog', link: 'https://github.com/avleonjs/avleon/blob/main/packages/core/CHANGELOG.md' },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/getting-started/introduction' },
          { text: 'Installation', link: '/getting-started/installation' },
          { text: 'Usage', link: '/getting-started/usage' },
          { text: 'Upgrading to 0.4', link: '/getting-started/upgrading-0.4' },
          { text: 'Upgrading to 0.3', link: '/getting-started/upgrading' },
        ],
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'Controller', link: '/core-concept/controller' },
          { text: 'Middleware', link: '/core-concept/middleware' },
          { text: 'Validation', link: '/core-concept/validation' },
          { text: 'Authentication', link: '/core-concept/authentication' },
        ],
      },
      {
        text: 'Advanced',
        items: [
          { text: 'Database', link: '/advanced/database' },
          { text: 'Models (ORM)', link: '/advanced/orm' },
          { text: 'Events', link: '/advanced/events' },
          { text: 'Queue', link: '/advanced/queue' },
          { text: 'File Uploads', link: '/advanced/file-uploads' },
          { text: 'Caching', link: '/advanced/caching' },
          { text: 'Logging', link: '/advanced/logging' },
          { text: 'Plugins', link: '/advanced/plugins' },
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
        text: 'CLI',
        items: [{ text: 'Commands', link: '/cli/basic' }],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/avleonjs/avleon' }],

    search: { provider: 'local' },

    editLink: {
      pattern: 'https://github.com/avleonjs/avleonjs.github.io/edit/main/content/:path',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Tareq Hossain',
    },
  },
});
