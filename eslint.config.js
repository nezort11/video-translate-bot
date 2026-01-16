const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const prettierConfig = require("eslint-config-prettier");
const prettierPlugin = require("eslint-plugin-prettier");

module.exports = [
  // Global ignores
  {
    ignores: [
      "node_modules/**",
      "node_modules_prod/**",
      "build/**",
      "**/build/**",
      "dist/**",
      "**/dist/**",
      ".next/**",
      "**/.next/**",
      "out/**",
      "**/out/**",
      "storage/**",
      "session/**",
      "yc_env/**",
      "yc_storage/**",
      "patches/**",
      "*.config.js",
      "*.config.mjs",
      "drizzle.config.ts",
      "jest.config.js",
      "**/*.d.ts",
    ],
  },

  // TypeScript files configuration
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      // TypeScript rules
      ...tsPlugin.configs.recommended.rules,

      // Allow unused vars with underscore prefix
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      // Relaxed rules for existing codebase
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/ban-ts-comment": "off",

      // Prettier integration
      "prettier/prettier": "warn",

      // Enforce single newline at end of file
      "eol-last": ["error", "always"],
    },
  },

  // JavaScript files configuration
  {
    files: ["**/*.js", "**/*.mjs"],
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": "warn",
    },
  },

  // Disable rules that conflict with Prettier
  prettierConfig,
];
