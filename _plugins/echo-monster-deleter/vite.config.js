import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  base: './', // 相对路径 base —— file:// 协议下 / 会变成 E:/ 报错，必须用相对
  plugins: [
    vue(),
    // 把所有 JS / CSS / asset（图片/MP4）内联到单个 index.html
    // 解决 file:// 协议下 type="module" + crossorigin 被 CORS 拦截的问题
    viteSingleFile()
  ],
  server: {
    port: 5175,
    strictPort: true,
    open: true
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 100000000 // 强制所有资源内联（默认 4096 字节，超过会外链）
  }
})
