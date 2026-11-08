// eslint.config.mjs (ESM via the .mjs extension; package.json has no "type")
import eslintPluginTs from "@typescript-eslint/eslint-plugin";
import parserTs from "@typescript-eslint/parser";

export default [
  {
    ignores: ["**/dist/**", "**/build/**", "node_modules/**", "coverage/**"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: parserTs,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        require: "readonly",
        module: "readonly",
        process: "readonly",
        __dirname: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": eslintPluginTs,
    },
    rules: {
      semi: ["error", "always"],
      quotes: ["error", "double"],
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // The ORM is a plugin that will move to @meghjs/orm. Only orm/core.ts may
  // reach into core; everything else in orm/ goes through it. Tests may use
  // core directly to build apps.
  {
    files: ["src/orm/**/*.ts"],
    ignores: ["src/orm/core.ts", "src/orm/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*", "!../orm/*"],
              message:
                "Import core through ./core so the ORM can move to @meghjs/orm.",
            },
          ],
        },
      ],
    },
  },
  // Core doesn't depend on the ORM, apart from registering it as a built-in
  // plugin and re-exporting its API.
  {
    files: ["src/**/*.ts"],
    ignores: [
      "src/orm/**",
      "src/plugins/builtin.ts",
      "src/index.ts",
      "src/**/*.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/orm", "**/orm/*"],
              message:
                "Core must not depend on the ORM; it will move to @meghjs/orm.",
            },
          ],
        },
      ],
    },
  },
];
