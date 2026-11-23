import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Em desenvolvimento, roda as funções de /api como a Vercel faria.
const apiLocal = (): Plugin => ({
  name: 'api-local',
  configureServer(server) {
    server.middlewares.use('/api/evolution', async (req, res) => {
      const mod = await server.ssrLoadModule('/api/evolution.ts')
      await mod.default(req, res)
    })
  },
})

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'EVOLUTION_'))
  return { plugins: [react(), tailwindcss(), apiLocal()] }
})
