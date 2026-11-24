// Rota do WhatsApp do painel (Baileys direto no site + Supabase).
// Mesmo formato de respostas da antiga /api/evolution, para o painel não precisar saber qual motor está por trás.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { autorizado, lerCorpo } from './_auth.js'
import { apagarSessao, comConexao, configurado, db, destinoJid, destravar, endereco, info, parear, setInfo, travar } from './_wa.js'

export const config = { maxDuration: 120 }

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const send = (code: number, obj: unknown) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(obj))
  }
  if (!autorizado(req)) return send(401, { erro: 'Entre no painel de novo' })
  if (!configurado()) return send(200, { configurado: false })
  const url = new URL(req.url || '/', 'http://local')
  const action = url.searchParams.get('action')

  try {
    if (action === 'status') {
      const [{ count }, cx, sync] = await Promise.all([
        db().from('wa_auth').select('id', { count: 'exact', head: true }).eq('id', 'creds'),
        info('conexao'), info('sync'),
      ])
      const conectado = !!count && cx?.estado === 'conectado'
      return send(200, {
        configurado: true, estado: conectado ? 'open' : 'close',
        perfil: conectado ? { nome: cx?.nome ?? null, numero: cx?.numero ?? null, foto: null } : null,
        ultimaSync: sync?.ts ?? null,
      })
    }

    if (action === 'qr') {
      const cx = await info('conexao')
      return send(200, { estado: cx?.estado ?? 'nada', qr: cx?.qr ?? null, codigo: cx?.codigo ?? null })
    }

    if (action === 'conversas') {
      const { data } = await db().from('wa_chats').select('*').not('ultima_ts', 'is', null).order('ultima_ts', { ascending: false }).limit(150)
      const conversas = (data ?? []).map(c => ({
        fone: endereco(c.jid), telefone: c.telefone, nome: c.nome, foto: c.foto, ts: c.ultima_ts, naoLidas: c.nao_lidas ?? 0,
        ultima: { texto: c.ultima_texto, deMim: !!c.ultima_de_mim, ts: c.ultima_ts },
      }))
      return send(200, { conversas })
    }

    if (action === 'mensagens') {
      const jid = destinoJid(url.searchParams.get('fone') || '')
      if (!jid) return send(400, { erro: 'Número inválido' })
      const { data } = await db().from('wa_messages').select('id,de_mim,texto,ts').eq('jid', jid).order('ts', { ascending: false }).limit(80)
      return send(200, { mensagens: (data ?? []).reverse().map(m => ({ id: m.id, deMim: m.de_mim, texto: m.texto, ts: m.ts })) })
    }

    if (req.method !== 'POST') return send(405, { erro: 'Use POST' })

    if (action === 'conectar') {
      const numero = (url.searchParams.get('numero') || '').replace(/\D/g, '')
      if (!(await travar(115))) return send(409, { erro: 'Já existe uma conexão em andamento. Tente em 1 minuto.' })
      await setInfo('conexao', { estado: 'iniciando' })
      try {
        const r = await parear(105000, numero ? (numero.length <= 11 ? '55' + numero : numero) : undefined)
        return send(200, { estado: r === 'conectado' ? 'open' : r })
      } finally { await destravar() }
    }

    if (action === 'sincronizar') {
      if (!(await travar(45))) return send(200, { ok: false, ocupado: true })
      try {
        const n = await comConexao(async c => c.recebidas.length)
        return send(200, { ok: true, recebidas: n })
      } finally { await destravar() }
    }

    if (action === 'enviar') {
      const { numero, texto } = await lerCorpo(req)
      const jid = destinoJid(numero)
      const msg = String(texto || '').trim()
      if (!jid) return send(400, { erro: 'Número inválido' })
      if (!msg || msg.length > 1500) return send(400, { erro: 'Mensagem vazia ou longa demais' })
      const planoB = jid.endsWith('@lid') ? null : `https://wa.me/${jid.split('@')[0]}?text=${encodeURIComponent(msg)}`
      // espera a trava por até 25 s (outra sincronização pode estar rodando)
      let ok = false
      for (let i = 0; i < 10 && !(ok = await travar(45)); i++) await new Promise(r => setTimeout(r, 2500))
      if (!ok) return send(409, { erro: 'WhatsApp ocupado, tente de novo', planoB })
      try {
        const id = await comConexao(async ({ sock, recebidas }) => {
          await sock.presenceSubscribe(jid).catch(() => {})
          await sock.sendPresenceUpdate('composing', jid).catch(() => {})
          await new Promise(r => setTimeout(r, 1500 + Math.floor(Math.random() * 2000)))
          await sock.sendPresenceUpdate('paused', jid).catch(() => {})
          const enviada = await sock.sendMessage(jid, { text: msg })
          if (enviada) recebidas.push(enviada)
          await new Promise(r => setTimeout(r, 1200)) // dá tempo de o servidor confirmar
          return enviada?.key?.id ?? null
        }, { esperarPendentesMs: 2500 })
        return send(200, { ok: true, id })
      } finally { await destravar() }
    }

    if (action === 'sair') {
      if (!(await travar(30))) return send(409, { erro: 'Tente de novo em instantes' })
      try {
        await comConexao(async ({ sock }) => { await sock.logout().catch(() => {}) }, { esperarPendentesMs: 500 }).catch(() => {})
        await apagarSessao()
        return send(200, { estado: 'close' })
      } finally { await destravar() }
    }

    return send(400, { erro: 'Ação desconhecida' })
  } catch (e) {
    const m = String((e as Error)?.message || e)
    if (m === 'SEM_SESSAO') return send(409, { erro: 'WhatsApp desconectado', semSessao: true })
    if (m === 'SESSAO_ENCERRADA') return send(409, { erro: 'O WhatsApp encerrou a sessão. Conecte de novo em Ajustes.', semSessao: true })
    if (m === 'NAO_CONECTOU') return send(503, { erro: 'Não consegui conectar ao WhatsApp agora. Tente de novo.' })
    return send(500, { erro: 'Erro no WhatsApp', detalhe: m })
  }
}
