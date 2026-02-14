module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "prettier"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  rules: {
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
  ignorePatterns: [
    "node_modules/",
    "node_modules_prod/",
    "build/",
    "**/build/",
    "dist/",
    "**/dist/",
    ".next/",
    "**/.next/",
    "out/",
    "**/out/",
    "storage/",
    "session/",
    "yc_env/",
    "yc_storage/",
    "patches/",
    "*.config.js",
    "*.config.mjs",
    "drizzle.config.ts",
    "jest.config.js",
    "**/*.d.ts",
  ],
};
