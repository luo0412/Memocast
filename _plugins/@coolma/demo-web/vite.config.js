import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 软链接 @coolma/muya 到兄弟目录 ../muya
      '@coolma/muya': path.resolve(__dirname, '../muya/lib'),
      '@coolma/muya/themes': path.resolve(__dirname, '../muya/themes')
    }
  },
  server: {
    port: 5174,
    strictPort: true
  }
})
