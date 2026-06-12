import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [dts({ include: ['src/lib'], exclude: ['**/*.test.ts'] })],
  publicDir: false,
  build: {
    lib: {
      entry: resolve(__dirname, 'src/lib/index.ts'),
      name: 'GraphsLib',
      fileName: (format) => `graphs.${format}.js`,
      formats: ['es', 'umd'],
    },
    outDir: 'dist/lib',
    sourcemap: false,
    // D3 is bundled in for self-contained Blazor wwwroot deployment.
    // The ESM output is ~300KB minified (~90KB gzipped).
    // To externalize d3, add: rollupOptions: { external: ['d3'] }
  },
})
