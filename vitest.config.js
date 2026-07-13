import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    include: ['tests/unit/**/*.test.js'],
    restoreMocks: true,
  },
})
