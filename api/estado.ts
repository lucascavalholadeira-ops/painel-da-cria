// Estado do painel (contatos, etiquetas, cards, agenda) guardado no Supabase,
// para a dona e a recepção verem a mesma coisa em qualquer aparelho.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { autorizado, lerCorpo } from './_auth.js'
import { configurado, db } from './_wa.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const send = (code: number, obj: unknown) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(obj))
  }
  if (!autorizado(req)) return send(401, { erro: 'Entre no painel de novo' })
  if (!configurado()) return send(200, { ativo: false })
  try {
    if (req.method === 'GET') {
      const { data } = await db().from('painel_estado').select('data,updated_at').eq('id', 'principal').maybeSingle()
      return send(200, { ativo: true, data: data?.data ?? null, versao: data?.updated_at ?? null })
    }
    if (req.method === 'PUT') {
      const { data } = await lerCorpo(req, 4_000_000)
      if (!data || typeof data !== 'object') return send(400, { erro: 'Dados inválidos' })
      const versao = new Date().toISOString()
      const { error } = await db().from('painel_estado').upsert({ id: 'principal', data, updated_at: versao })
      if (error) return send(500, { erro: error.message })
      return send(200, { ok: true, versao })
    }
    return send(405, { erro: 'Método não aceito' })
  } catch (e) {
    return send(500, { erro: String((e as Error)?.message || e) })
  }
}
