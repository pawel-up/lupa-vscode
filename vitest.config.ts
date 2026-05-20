import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    setupFiles: [],
    alias: {
      'vscode': path.resolve(__dirname, './tests/__mocks__/vscode.ts')
    }
  },
})
