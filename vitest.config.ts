import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
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
