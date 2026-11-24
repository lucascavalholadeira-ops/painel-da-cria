// Função de servidor (Vercel) que fala com a Evolution API.
// A chave fica só aqui, nunca no navegador, e só a instância da demo é acessível.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { autorizado, lerCorpo } from './_auth.js'

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

// Texto de uma mensagem da Evolution/Baileys (texto, legenda ou tipo da mídia)
function textoDe(m: any): string {
  const x = m?.message ?? {}
  return x.conversation ?? x.extendedTextMessage?.text ?? x.imageMessage?.caption ?? x.videoMessage?.caption
    ?? (x.imageMessage ? '📷 Foto' : x.audioMessage ? '🎤 Áudio' : x.videoMessage ? '🎬 Vídeo' : x.documentMessage ? '📄 Documento' : x.stickerMessage ? 'Figurinha' : '')
}
const tsDe = (m: any) => Number(m?.messageTimestamp ?? 0) * 1000
// Conversa com uma pessoa: número (@s.whatsapp.net) ou o código novo do WhatsApp (@lid). Grupos, canais e o próprio WhatsApp ficam de fora.
const individual = (jid: string) => /^[1-9]\d{5,}@(s\.whatsapp\.net|lid)$/.test(jid || '')
/** Endereço da conversa: só dígitos para números de telefone, ou o jid completo para @lid. */
const endereco = (jid: string) => (jid.endsWith('@lid') ? jid : jid.split('@')[0])
function destino(v: string): string | null {
  const s = String(v || '').trim()
  if (/^\d{6,}@lid$/.test(s)) return s
  let n = s.replace(/\D/g, '')
  if (n.length === 10 || n.length === 11) n = '55' + n
  return n.length >= 12 && n.length <= 13 ? n : null
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
  if (!autorizado(req)) return send(401, { erro: 'Entre no painel de novo' })
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

    if (action === 'conversas') {
      const r = await evo(`/chat/findChats/${encodeURIComponent(INST)}`, 'POST', {})
      const lista = (Array.isArray(r.j) ? r.j : r.j?.chats ?? []).filter((c: any) => individual(c.remoteJid ?? c.id))
      const conversas = lista.map((c: any) => {
        const jid = c.remoteJid ?? c.id
        const u = c.lastMessage
        return {
          fone: endereco(jid), nome: c.pushName ?? c.name ?? (u && !u.key?.fromMe ? u.pushName : null) ?? null, foto: c.profilePicUrl ?? null,
          ts: u ? tsDe(u) : new Date(c.updatedAt ?? 0).getTime(), naoLidas: c.unreadCount ?? c.unreadMessages ?? 0,
          ultima: u ? { texto: textoDe(u), deMim: !!u.key?.fromMe, ts: tsDe(u) } : null,
        }
      }).sort((a: any, b: any) => b.ts - a.ts).slice(0, 150)
      return send(200, { conversas })
    }

    if (action === 'mensagens') {
      const d = destino(url.searchParams.get('fone') || '')
      if (!d) return send(400, { erro: 'Número inválido' })
      const jid = d.includes('@') ? d : `${d}@s.whatsapp.net`
      const r = await evo(`/chat/findMessages/${encodeURIComponent(INST)}`, 'POST', { where: { key: { remoteJid: jid } }, page: 1, offset: 80 })
      const regs = r.j?.messages?.records ?? (Array.isArray(r.j) ? r.j : [])
      const mensagens = regs.map((m: any) => ({ id: m.key?.id ?? m.id, deMim: !!m.key?.fromMe, texto: textoDe(m), ts: tsDe(m) }))
        .filter((m: any) => m.texto).sort((a: any, b: any) => a.ts - b.ts)
      return send(200, { mensagens })
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
      if (!qrDe(c.j) && !codigoDe(c.j)) {
        // Instância presa (QR expirou muitas vezes): reinicia e pede de novo.
        await evo(`/instance/restart/${encodeURIComponent(INST)}`, 'POST')
        await new Promise(r => setTimeout(r, 2500))
        c = await evo(`/instance/connect/${encodeURIComponent(INST)}${q}`)
      }
      return send(200, { estado: 'connecting', qr: qrDe(c.j), codigo: codigoDe(c.j) })
    }

    if (action === 'enviar') {
      const { numero, texto } = await lerCorpo(req)
      const n = destino(numero)
      const msg = String(texto || '').trim()
      if (!n) return send(400, { erro: 'Número inválido' })
      if (!msg || msg.length > 1500) return send(400, { erro: 'Mensagem vazia ou longa demais' })
      const st = await evo(`/instance/connectionState/${encodeURIComponent(INST)}`)
      if (st.j?.instance?.state !== 'open') return send(409, { erro: 'WhatsApp desconectado', planoB: n.includes('@') ? null : `https://wa.me/${n}?text=${encodeURIComponent(msg)}` })
      // "digitando…" por 1,5 a 3,5 s antes de mandar, como uma pessoa
      const r = await evo(`/message/sendText/${encodeURIComponent(INST)}`, 'POST', { number: n, text: msg, delay: 1500 + Math.floor(Math.random() * 2000) })
      if (r.status >= 400) return send(502, { erro: 'O WhatsApp recusou o envio', detalhe: r.j, planoB: n.includes('@') ? null : `https://wa.me/${n}?text=${encodeURIComponent(msg)}` })
      return send(200, { ok: true, id: r.j?.key?.id ?? null })
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
