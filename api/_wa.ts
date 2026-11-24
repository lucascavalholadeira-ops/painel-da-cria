// WhatsApp direto pelo Baileys, rodando nas funções do site (sem servidor próprio).
// A sessão (credenciais e chaves) fica no Supabase. Cada ação conecta, faz o que precisa e desconecta.
import makeWASocket, { Browsers, BufferJSON, DisconnectReason, initAuthCreds, proto, type WASocket, type WAMessage } from 'baileys'
import { createClient } from '@supabase/supabase-js'
import { pino } from 'pino'
import { HttpsProxyAgent } from 'https-proxy-agent'

const URL_DB = process.env.SUPABASE_URL || ''
const KEY_DB = process.env.SUPABASE_SERVICE_KEY || ''
export const configurado = () => !!(URL_DB && KEY_DB)
export const db = () => createClient(URL_DB, KEY_DB, { auth: { persistSession: false } })
const logger = pino({ level: process.env.WA_LOG || 'silent' })
// Só para testes locais atrás de proxy (WA_PROXY=http://...). Na Vercel fica vazio.
const agente = process.env.WA_PROXY ? new HttpsProxyAgent(process.env.WA_PROXY) : undefined

// ---------- sessão no Supabase ----------
const serializar = (v: unknown) => JSON.parse(JSON.stringify(v, BufferJSON.replacer))
const desserializar = (v: unknown) => JSON.parse(JSON.stringify(v), BufferJSON.reviver)

async function carregarSessao() {
  const s = db()
  const mem = new Map<string, any>()
  for (let de = 0; ; de += 1000) {
    const { data, error } = await s.from('wa_auth').select('id,data').range(de, de + 999)
    if (error) throw new Error('Supabase: ' + error.message)
    for (const r of data ?? []) mem.set(r.id, desserializar(r.data))
    if (!data || data.length < 1000) break
  }
  const sujos = new Map<string, any | null>()
  const creds = mem.get('creds') ?? initAuthCreds()
  const state = {
    creds,
    keys: {
      get: async (type: string, ids: string[]) => {
        const out: Record<string, any> = {}
        for (const id of ids) {
          let v = mem.get(`${type}-${id}`)
          if (v && type === 'app-state-sync-key') v = proto.Message.AppStateSyncKeyData.fromObject(v)
          out[id] = v
        }
        return out
      },
      set: async (data: Record<string, Record<string, any>>) => {
        for (const type in data) for (const id in data[type]) {
          const k = `${type}-${id}`, v = data[type][id]
          if (v) mem.set(k, v); else mem.delete(k)
          sujos.set(k, v ?? null)
        }
      },
    },
  }
  const salvarCreds = () => { sujos.set('creds', state.creds) }
  async function gravar() {
    const up = [...sujos].filter(([, v]) => v !== null).map(([id, v]) => ({ id, data: serializar(v), updated_at: new Date().toISOString() }))
    const del = [...sujos].filter(([, v]) => v === null).map(([id]) => id)
    sujos.clear()
    for (let i = 0; i < up.length; i += 300) { const { error } = await s.from('wa_auth').upsert(up.slice(i, i + 300)); if (error) throw new Error('Supabase: ' + error.message) }
    for (let i = 0; i < del.length; i += 300) await s.from('wa_auth').delete().in('id', del.slice(i, i + 300))
  }
  return { state, salvarCreds, gravar, registrada: !!mem.get('creds')?.registered, creds }
}

export async function apagarSessao() {
  const s = db()
  await s.from('wa_auth').delete().neq('id', '')
  await s.from('wa_info').delete().eq('id', 'conexao')
}

export async function info(id: string) {
  const { data } = await db().from('wa_info').select('data,updated_at').eq('id', id).maybeSingle()
  return data ? { ...(data.data as any), atualizado: data.updated_at } : null
}
export async function setInfo(id: string, dados: Record<string, unknown>) {
  await db().from('wa_info').upsert({ id, data: dados, updated_at: new Date().toISOString() })
}

// ---------- trava (uma conexão por vez) ----------
export async function travar(segundos: number) {
  const { data, error } = await db().rpc('wa_travar', { segundos })
  if (error) throw new Error('Supabase: ' + error.message)
  return data === true
}
export const destravar = async () => { await db().rpc('wa_destravar') }

// ---------- mensagens ----------
export const individual = (jid?: string | null) => !!jid && /^[1-9]\d{5,}@(s\.whatsapp\.net|lid)$/.test(jid)
export const endereco = (jid: string) => (jid.endsWith('@lid') ? jid : jid.split('@')[0])
export function destinoJid(v: string): string | null {
  const s = String(v || '').trim()
  if (/^\d{6,}@lid$/.test(s)) return s
  let n = s.replace(/\D/g, '')
  if (n.length === 10 || n.length === 11) n = '55' + n
  return n.length >= 12 && n.length <= 13 ? `${n}@s.whatsapp.net` : null
}

function textoDe(m: WAMessage): string {
  const x: any = m.message ?? {}
  const c = x.ephemeralMessage?.message ?? x.viewOnceMessage?.message ?? x
  return c.conversation ?? c.extendedTextMessage?.text ?? c.imageMessage?.caption ?? c.videoMessage?.caption
    ?? (c.imageMessage ? '📷 Foto' : c.audioMessage ? '🎤 Áudio' : c.videoMessage ? '🎬 Vídeo' : c.documentMessage ? '📄 Documento' : c.stickerMessage ? 'Figurinha' : '')
}
const tsDe = (m: WAMessage) => Number(m.messageTimestamp ?? 0) * 1000

/** Grava mensagens novas e atualiza a lista de conversas. */
export async function gravarMensagens(lista: WAMessage[]) {
  const limite = Date.now() - 45 * 86400000 // guarda só os últimos 45 dias
  const msgs = new Map<string, { id: string; jid: string; de_mim: boolean; texto: string; ts: number; nome?: string | null; alt?: string | null }>()
  for (const m of lista) {
    const jid = m.key?.remoteJid
    if (!individual(jid) || !m.key?.id) continue
    const texto = textoDe(m), ts = tsDe(m)
    if (!texto || ts < limite) continue
    const k: any = m.key
    const alt = [k.remoteJidAlt, k.senderPn].find((x: string) => x && x.endsWith('@s.whatsapp.net'))
    msgs.set(m.key.id, { id: m.key.id, jid: jid!, de_mim: !!m.key.fromMe, texto, ts, nome: m.key.fromMe ? null : m.pushName ?? null, alt: alt ? alt.split('@')[0] : null })
  }
  if (!msgs.size) return 0
  const s = db()
  const linhas = [...msgs.values()]
  for (let i = 0; i < linhas.length; i += 500)
    await s.from('wa_messages').upsert(linhas.slice(i, i + 500).map(({ id, jid, de_mim, texto, ts }) => ({ id, jid, de_mim, texto, ts })))

  // última mensagem de cada conversa
  const porChat = new Map<string, (typeof linhas)[number] & { nomeChat?: string | null; telefone?: string | null }>()
  for (const l of linhas) {
    const atual = porChat.get(l.jid)
    const nome = l.nome ?? atual?.nomeChat ?? null, tel = l.alt ?? atual?.telefone ?? null
    if (!atual || l.ts > atual.ts) porChat.set(l.jid, { ...l, nomeChat: nome, telefone: tel })
    else porChat.set(l.jid, { ...atual, nomeChat: nome, telefone: tel })
  }
  const jids = [...porChat.keys()]
  const { data: existentes } = await s.from('wa_chats').select('jid,ultima_ts,nome,telefone').in('jid', jids)
  const ex = new Map((existentes ?? []).map(e => [e.jid, e]))
  const rows = jids.map(jid => {
    const c = porChat.get(jid)!, e = ex.get(jid)
    const maisNova = !e || (e.ultima_ts ?? 0) <= c.ts
    return {
      jid, nome: c.nomeChat ?? e?.nome ?? null, telefone: c.telefone ?? e?.telefone ?? null,
      ultima_texto: maisNova ? c.texto : undefined, ultima_de_mim: maisNova ? c.de_mim : undefined, ultima_ts: maisNova ? c.ts : e?.ultima_ts,
      updated_at: new Date().toISOString(),
    }
  })
  // separa quem ganhou última mensagem nova de quem só atualizou nome, para não apagar campos
  const comMsg = rows.filter(r => r.ultima_texto !== undefined), soNome = rows.filter(r => r.ultima_texto === undefined).map(({ jid, nome, telefone, updated_at }) => ({ jid, nome, telefone, updated_at }))
  if (comMsg.length) await s.from('wa_chats').upsert(comMsg)
  if (soNome.length) await s.from('wa_chats').upsert(soNome)
  return linhas.length
}

// ---------- conexão ----------
type Sessao = Awaited<ReturnType<typeof carregarSessao>>
export interface Conexao { sock: WASocket; sessao: Sessao; recebidas: WAMessage[]; fechar: () => Promise<void> }

function criarSocket(sessao: Sessao, recebidas: WAMessage[]) {
  const sock = makeWASocket({
    auth: sessao.state as any, logger, browser: Browsers.macOS('Chrome'),
    markOnlineOnConnect: false, syncFullHistory: false, generateHighQualityLinkPreview: false,
    shouldSyncHistoryMessage: () => true,
    ...(agente ? { agent: agente as any, fetchAgent: agente as any } : {}),
  })
  sock.ev.on('creds.update', sessao.salvarCreds)
  sock.ev.on('messages.upsert', ({ messages }) => { recebidas.push(...messages) })
  sock.ev.on('messaging-history.set', ({ messages }) => { recebidas.push(...messages) })
  return sock
}

/**
 * Conecta com a sessão salva, espera abrir e as mensagens pendentes chegarem, roda `acao` e desconecta.
 * Sem sessão salva, lança 'SEM_SESSAO'.
 */
export async function comConexao<T>(acao: (c: Conexao) => Promise<T>, opcoes: { esperarPendentesMs?: number } = {}): Promise<T> {
  const sessao = await carregarSessao()
  if (!sessao.registrada) throw new Error('SEM_SESSAO')
  const recebidas: WAMessage[] = []
  let sock = criarSocket(sessao, recebidas)
  const aberto = await new Promise<'ok' | 'saiu' | 'falhou'>(resolve => {
    const t = setTimeout(() => resolve('falhou'), 20000)
    let tentativas = 0
    const ouvir = (s: WASocket) => s.ev.on('connection.update', u => {
      if (u.connection === 'open') { clearTimeout(t); resolve('ok') }
      if (u.connection === 'close') {
        const code = (u.lastDisconnect?.error as any)?.output?.statusCode
        if (code === DisconnectReason.loggedOut) { clearTimeout(t); resolve('saiu') }
        else if (tentativas++ < 2) { sock = criarSocket(sessao, recebidas); ouvir(sock) }
        else { clearTimeout(t); resolve('falhou') }
      }
    })
    ouvir(sock)
  })
  if (aberto === 'saiu') { await apagarSessao(); throw new Error('SESSAO_ENCERRADA') }
  if (aberto === 'falhou') { try { sock.end(undefined) } catch { /* já fechado */ } await sessao.gravar(); throw new Error('NAO_CONECTOU') }

  // espera as mensagens que chegaram enquanto estava desconectado
  await new Promise<void>(resolve => {
    const t = setTimeout(resolve, opcoes.esperarPendentesMs ?? 7000)
    sock.ev.on('connection.update', u => { if (u.receivedPendingNotifications) { clearTimeout(t); setTimeout(resolve, 1500) } })
  })
  const fechar = async () => { try { sock.end(undefined) } catch { /* já fechado */ } }
  try {
    return await acao({ sock, sessao, recebidas, fechar })
  } finally {
    await gravarMensagens(recebidas).catch(() => 0)
    await fechar()
    await sessao.gravar()
    await setInfo('sync', { ts: Date.now() }).catch(() => {})
  }
}

/**
 * Pareamento: abre uma conexão nova, publica o QR (ou o código) em wa_info e espera ler, até `limiteMs`.
 */
export async function parear(limiteMs: number, numero?: string): Promise<'conectado' | 'expirou' | 'erro'> {
  await apagarSessao()
  const sessao = await carregarSessao()
  const recebidas: WAMessage[] = []
  let sock = criarSocket(sessao, recebidas)
  let pediuCodigo = false
  const fim = Date.now() + limiteMs
  const resultado = await new Promise<'conectado' | 'expirou' | 'erro'>(resolve => {
    const t = setTimeout(() => resolve('expirou'), limiteMs)
    const ouvir = (s: WASocket) => s.ev.on('connection.update', async u => {
      if (u.qr) {
        if (numero && !pediuCodigo) {
          pediuCodigo = true
          try { const codigo = await s.requestPairingCode(numero.replace(/\D/g, '')); await setInfo('conexao', { estado: 'aguardando', codigo, ate: fim }) }
          catch { await setInfo('conexao', { estado: 'erro', erro: 'Não consegui gerar o código' }) }
        } else if (!numero) {
          const QR = await import('qrcode')
          await setInfo('conexao', { estado: 'aguardando', qr: await QR.toDataURL(u.qr, { margin: 1, width: 300 }), ate: fim })
        }
      }
      if (u.connection === 'open') { clearTimeout(t); resolve('conectado') }
      if (u.connection === 'close') {
        const code = (u.lastDisconnect?.error as any)?.output?.statusCode
        // depois de ler o QR, o WhatsApp pede para reiniciar a conexão (515)
        if (code === DisconnectReason.restartRequired) { sock = criarSocket(sessao, recebidas); ouvir(sock) }
        else if (code === DisconnectReason.loggedOut) { clearTimeout(t); resolve('erro') }
        else if (Date.now() < fim - 5000) { sock = criarSocket(sessao, recebidas); ouvir(sock) }
      }
    })
    ouvir(sock)
  })
  if (resultado === 'conectado') {
    await sessao.gravar()
    const eu = sock.user
    await setInfo('conexao', { estado: 'conectado', nome: eu?.name ?? null, numero: (eu?.id ?? '').split(':')[0].split('@')[0] || null })
    // pega o histórico recente que o WhatsApp manda logo depois de conectar
    await new Promise(r => setTimeout(r, Math.max(0, Math.min(12000, fim - Date.now() - 3000))))
    await gravarMensagens(recebidas).catch(() => 0)
    await sessao.gravar()
  } else {
    await setInfo('conexao', { estado: resultado === 'expirou' ? 'expirou' : 'erro' })
  }
  try { sock.end(undefined) } catch { /* já fechado */ }
  return resultado
}
