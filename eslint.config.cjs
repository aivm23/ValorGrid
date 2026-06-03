module.exports = [
  {
    ignores: [
      'node_modules/**',
      'vendor/**',
      'data/**',
      'backups/**',
      '.backups/**',
      'dist/**',
      'imports/**',
      'local/**',
      '.opencode/**',
    ],
  },
  {
    files: ['server.js', 'scripts/**/*.js', 'src/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        AbortController: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        global: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      'no-with': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
      'no-redeclare': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-restricted-modules': [
        'error',
        {
          paths: [
            {
              name: 'node:sqlite',
              message: 'Use SQLite only through src/platform/db.js.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['client/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        AbortController: 'readonly',
        Blob: 'readonly',
        Date: 'readonly',
        FileReader: 'readonly',
        Intl: 'readonly',
        Map: 'readonly',
        Math: 'readonly',
        Number: 'readonly',
        Promise: 'readonly',
        Set: 'readonly',
        URL: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
      },
    },
    rules: {
      'no-with': 'error',
      'no-new-func': 'error',
      'no-implied-eval': 'error',
      'no-redeclare': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-restricted-modules': [
        'error',
        {
          paths: [
            {
              name: 'node:sqlite',
              message: 'Use SQLite only through src/platform/db.js.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/platform/db.js'],
    rules: {
      'no-restricted-modules': 'off',
    },
  },
];
