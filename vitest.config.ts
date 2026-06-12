import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: {
      // requestAnimationFrame must exist for d3-timer / d3-transition.
      jsdom: { pretendToBeVisual: true },
    },
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
