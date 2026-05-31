import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'legacy-index.html', 'demo.html'],
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        AbortController: 'readonly',
        ArrayBuffer: 'readonly',
        Blob: 'readonly',
        CustomEvent: 'readonly',
        DataView: 'readonly',
        Event: 'readonly',
        EventTarget: 'readonly',
        File: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLInputElement: 'readonly',
        ReadableStream: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        Uint8Array: 'readonly',
        URL: 'readonly',
        WritableStream: 'readonly',
        clearTimeout: 'readonly',
        confirm: 'readonly',
        crypto: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
