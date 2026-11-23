// Função de servidor (Vercel) que fala com a Evolution API.
// A chave fica só aqui, nunca no navegador, e só a instância da demo é acessível.
import type { IncomingMessage, ServerResponse } from 'node:http'

const BASE = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '')
const KEY = process.env.EVOLUTION_API_KEY || ''
const INST = process.env.EVOLUTION_INSTANCE || 'painel-da-cria-demo'

async function evo(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(BASE + path, {
    method,
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await r.text()
  let j: any
  try { j = JSON.parse(t) } catch { j = { raw: t } }
  return { status: r.status, j }
}

const qrDe = (j: any) => j?.base64 || j?.qrcode?.base64 || null
const codigoDe = (j: any) => j?.pairingCode || j?.qrcode?.pairingCode || null

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const send = (code: number, obj: unknown) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(obj))
  }
  if (!BASE || !KEY) return send(200, { configurado: false })
  const url = new URL(req.url || '/', 'http://local')
  const action = url.searchParams.get('action')

  try {
    if (action === 'status') {
      const s = await evo(`/instance/connectionState/${encodeURIComponent(INST)}`)
      if (s.status === 404) return send(200, { configurado: true, estado: 'sem_instancia' })
      const estado = s.j?.instance?.state ?? 'close'
      let perfil = null
      if (estado === 'open') {
        const f = await evo(`/instance/fetchInstances?instanceName=${encodeURIComponent(INST)}`)
        const i = Array.isArray(f.j) ? f.j[0] : null
        if (i) perfil = { nome: i.profileName ?? null, numero: (i.ownerJid ?? '').split('@')[0] || null, foto: i.profilePicUrl ?? null }
      }
      return send(200, { configurado: true, estado, perfil })
    }

    if (req.method !== 'POST') return send(405, { erro: 'Use POST' })

    if (action === 'conectar') {
      const numero = (url.searchParams.get('numero') || '').replace(/\D/g, '')
      const q = numero ? `?number=${numero}` : ''
      let c = await evo(`/instance/connect/${encodeURIComponent(INST)}${q}`)
      if (c.status === 404) {
        const criar = await evo('/instance/create', 'POST', { instanceName: INST, qrcode: true, integration: 'WHATSAPP-BAILEYS', ...(numero ? { number: numero } : {}) })
        if (criar.status >= 400) return send(502, { erro: 'Não consegui criar a instância', detalhe: criar.j })
        c = qrDe(criar.j) ? criar : await evo(`/instance/connect/${encodeURIComponent(INST)}${q}`)
      }
      if (c.j?.instance?.state === 'open') return send(200, { estado: 'open' })
      return send(200, { estado: 'connecting', qr: qrDe(c.j), codigo: codigoDe(c.j) })
    }

    if (action === 'sair') {
      await evo(`/instance/logout/${encodeURIComponent(INST)}`, 'DELETE')
      return send(200, { estado: 'close' })
    }

    return send(400, { erro: 'Ação desconhecida' })
  } catch (e) {
    return send(502, { erro: 'Evolution API fora do ar', detalhe: String(e) })
  }
}
