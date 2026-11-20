import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Configuración de Vite: React + Tailwind CSS (v4, vía plugin oficial)
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
