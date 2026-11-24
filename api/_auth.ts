// Login do painel: senha em PAINEL_SENHA (variável de ambiente) e cookie assinado.
// Arquivos com "_" na frente não viram rota na Vercel.
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

const SENHA = () => process.env.PAINEL_SENHA || ''
const token = () => createHmac('sha256', SENHA() + '|' + (process.env.EVOLUTION_API_KEY || '')).update('painel-da-cria').digest('hex')
const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }

/** Sem PAINEL_SENHA definida (ex.: rodando local), o login fica aberto. */
export const exigeSenha = () => !!SENHA()
export const senhaConfere = (s: string) => igual(String(s || ''), SENHA())
export function autorizado(req: IncomingMessage) {
  if (!exigeSenha()) return true
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)painel=([a-f0-9]+)/)
  return !!m && igual(m[1], token())
}
export const cookieLogin = () => `painel=${token()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
export const cookieSair = () => 'painel=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'

export async function lerCorpo(req: IncomingMessage, limite = 20000): Promise<any> {
  const pronto = (req as any).body
  if (pronto !== undefined) return typeof pronto === 'string' ? JSON.parse(pronto || '{}') : pronto
  let t = ''
  for await (const c of req) { t += c; if (t.length > limite) break }
  try { return JSON.parse(t || '{}') } catch { return {} }
}
