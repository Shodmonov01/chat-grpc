import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/chat.ChatService": { target: "http://localhost:9000", changeOrigin: true },
    },
  },
})
