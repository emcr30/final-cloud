import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Configuración de Vite: React + Tailwind CSS (v4, vía plugin oficial)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // El paquete principal (React + Supabase + router) pesa ~540 kB (~157 kB gzip).
    // Mapa y gráficos ya se cargan aparte (React.lazy en App.tsx).
    chunkSizeWarningLimit: 600,
  },
})
