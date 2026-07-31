import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Memocast path stubs for standalone use
      'boot/i18n': path.resolve(__dirname, './src/boot/i18n.js'),
      'src/components/echo/echoCore': path.resolve(__dirname, './src/components/echo/echoCore.js'),
      // muya lib (精确匹配，防止 /lib -> /lib/lib)
      '^@coolma/muya/lib$': path.resolve(__dirname, '../muya/lib'),
      '^@coolma/muya/themes/default.css$': path.resolve(__dirname, '../muya/themes/default.css')
    }
  },
  // 确保 esbuild 等预构建工具正确处理 @coolma/muya
  optimizeDeps: {
    include: ['katex', 'eve', 'vue', 'vue-i18n']
  },
  server: {
    port: 5174,
    strictPort: true
  }
})
