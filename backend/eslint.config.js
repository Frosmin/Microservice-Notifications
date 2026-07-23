export default [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'docs/evidencias/**',
      'docs/openapi.json'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    rules: {
      'no-debugger': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-imports': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-useless-catch': 'error',
      'valid-typeof': 'error'
    }
  }
];
