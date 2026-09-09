import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/integration/**/*.test.ts',
      'tests/performance/**/*.test.ts',
    ],
  },
})
