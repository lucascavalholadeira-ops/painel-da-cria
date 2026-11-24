import type { IncomingMessage, ServerResponse } from 'node:http'
import { autorizado, cookieLogin, cookieSair, exigeSenha, lerCorpo, senhaConfere } from './_auth.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const send = (code: number, obj: unknown, cookie?: string) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    if (cookie) res.setHeader('Set-Cookie', cookie)
    res.end(JSON.stringify(obj))
  }
  if (req.method === 'GET') return send(200, { exigeSenha: exigeSenha(), logado: autorizado(req) })
  if (req.method === 'DELETE') return send(200, { ok: true }, cookieSair())
  if (req.method !== 'POST') return send(405, { erro: 'Método não aceito' })
  const { senha } = await lerCorpo(req)
  if (!exigeSenha()) return send(200, { ok: true })
  await new Promise(r => setTimeout(r, 400)) // freia tentativas em sequência
  if (!senhaConfere(senha)) return send(401, { erro: 'Senha incorreta' })
  return send(200, { ok: true }, cookieLogin())
}
