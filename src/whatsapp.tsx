import { useCallback, useEffect, useState } from 'react'

/** Motor do WhatsApp: '/api/evolution' (Evolution na VPS, padrão) ou '/api/wpp' (Baileys direto no site). */
export const WPP_API = (import.meta.env.VITE_WPP_API as string | undefined) || '/api/evolution'

export interface StatusWpp {
  configurado: boolean
  erro?: string
  estado?: 'open' | 'close' | 'connecting' | 'sem_instancia'
  perfil?: { nome: string | null; numero: string | null; foto: string | null } | null
}

const api = async (action: string, post = false, extra = '') => {
  const r = await fetch(`${WPP_API}?action=${action}${extra}`, { method: post ? 'POST' : 'GET' })
  return r.json()
}

/** Status da conexão, consultado a cada `intervalo` ms (0 = não consulta). */
export function useStatusWpp(intervalo = 30000) {
  const [st, setSt] = useState<StatusWpp | null>(null)
  const atualizar = useCallback(() => api('status').then(setSt).catch(() => setSt({ configurado: false })), [])
  useEffect(() => {
    if (!intervalo) return
    atualizar(); const t = setInterval(atualizar, intervalo); return () => clearInterval(t)
  }, [atualizar, intervalo])
  return { st, atualizar }
}

const fmtNumero = (n?: string | null) => (n ? n.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, '+$1 $2 $3-$4') : '')

/** Conecta o WhatsApp da clínica por QR code (ou código de pareamento no celular). */
export function ConectarWhatsApp() {
  const { st, atualizar } = useStatusWpp(3000)
  const [qr, setQr] = useState<string | null>(null)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [numero, setNumero] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const conectado = st?.estado === 'open'

  useEffect(() => { if (conectado) { setQr(null); setCodigo(null) } }, [conectado])

  // Pede o QR (ou o código) e fica acompanhando até o celular ler, por até 100 s.
  const [modoCodigo, setModoCodigo] = useState(false)
  function gerar(comNumero = false) {
    setCarregando(true); setErro(''); setQr(null); setCodigo(null); setModoCodigo(comNumero)
    const d = numero.replace(/\D/g, ''); const n = d.length <= 11 ? '55' + d : d
    fetch(`${WPP_API}?action=conectar${comNumero ? `&numero=${n}` : ''}`, { method: 'POST' })
      .then(r => r.json())
      .then(j => {
        if (j.erro) { setErro(j.erro); setCarregando(false); return }
        if (j.qr && !comNumero) setQr(j.qr)
        if (j.codigo) setCodigo(j.codigo)
        if (j.estado === 'open') { setCarregando(false); atualizar() }
        else if (j.estado === 'expirou' || j.estado === 'erro') { setErro(j.estado === 'expirou' ? 'O código expirou. Toque para gerar outro.' : 'O WhatsApp recusou a conexão. Tente de novo.'); setCarregando(false) }
      })
      .catch(() => { setErro('Não consegui falar com o servidor do WhatsApp'); setCarregando(false) })
  }
  useEffect(() => {
    if (!carregando) return
    const inicio = Date.now()
    const t = setInterval(async () => {
      if (Date.now() - inicio > 100000) { setCarregando(false); setErro('O código expirou. Toque para gerar outro.'); return }
      try {
        const j = await api('qr')
        if (j.estado === 'conectado') { setCarregando(false); atualizar(); return }
        if (j.qr && !modoCodigo) setQr(j.qr)
        if (j.codigo) setCodigo(j.codigo)
      } catch { /* tenta de novo */ }
    }, 3000)
    return () => clearInterval(t)
  }, [carregando]) // eslint-disable-line

  if (!st) return <p className="text-sm text-muted">Verificando WhatsApp…</p>
  if (st.erro) return <p className="text-sm text-red-700 font-medium">{st.erro}. Tente de novo em instantes.</p>
  if (!st.configurado) return <p className="text-sm text-muted">WhatsApp não configurado nesta instalação.</p>

  if (conectado) return (
    <div className="flex items-center gap-3 rounded-2xl bg-green-50 border border-green-200 p-3">
      {st.perfil?.foto ? <img src={st.perfil.foto} className="w-11 h-11 rounded-full" alt="" /> : <div className="w-11 h-11 rounded-full bg-wa text-white flex items-center justify-center text-lg">✓</div>}
      <div className="min-w-0"><p className="font-semibold text-green-900">WhatsApp conectado</p><p className="text-sm text-green-900/70">{st.perfil?.nome} {fmtNumero(st.perfil?.numero)}</p></div>
    </div>
  )

  return (
    <div className="space-y-3">
      <p className="text-sm rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">WhatsApp desconectado. Conecte o número da clínica abaixo.</p>
      {qr ? (
        <div className="space-y-2">
          <img src={qr} alt="QR code do WhatsApp" className="w-56 h-56 bg-white rounded-2xl p-2 mx-auto border border-line" />
          <p className="text-xs text-center text-muted">No celular da clínica: WhatsApp › Aparelhos conectados › Conectar aparelho › aponte para o código. O código se renova sozinho enquanto estiver na tela.</p>
        </div>
      ) : codigo ? (
        <div className="text-center space-y-2">
          <p className="text-3xl font-bold tracking-[.3em]">{codigo}</p>
          <p className="text-xs text-muted">WhatsApp › Aparelhos conectados › Conectar aparelho › Conectar com número de telefone › digite este código.</p>
        </div>
      ) : null}
      <button className="btn-gold w-full py-3" disabled={carregando} onClick={() => gerar()}>{carregando ? (qr || codigo ? 'Aguardando a leitura…' : 'Preparando…') : 'Mostrar QR code'}</button>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">Está no celular? Conectar com código</summary>
        <div className="flex gap-2 mt-2">
          <input className="input" placeholder="DDD + número, ex.: 96999998888" inputMode="tel" value={numero} onChange={e => setNumero(e.target.value)} />
          <button className="btn-send" disabled={numero.replace(/\D/g, '').length < 10 || carregando} onClick={() => gerar(true)}>Gerar</button>
        </div>
      </details>
      {erro && <p className="text-sm text-red-700 font-medium">{erro}</p>}
    </div>
  )
}

export function Desconectar() {
  const [ok, setOk] = useState(false)
  return <button className="btn-ghost text-red-700" disabled={ok} onClick={async () => {
    if (!confirm('Desconectar o WhatsApp da clínica?')) return
    setOk(true); await api('sair', true); location.reload()
  }}>Desconectar WhatsApp</button>
}

export interface ResultadoEnvio { ok: boolean; erro?: string; planoB?: string }

/** Envia uma mensagem de verdade pelo WhatsApp da clínica (Evolution). */
export async function enviarWhatsApp(numero: string, texto: string): Promise<ResultadoEnvio> {
  try {
    const r = await fetch(`${WPP_API}?action=enviar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero, texto }) })
    const j = await r.json()
    return r.ok ? { ok: true } : { ok: false, erro: j.erro ?? 'Não foi possível enviar', planoB: j.planoB }
  } catch { return { ok: false, erro: 'Sem conexão com o servidor' } }
}

/** Mensagem de teste em Ajustes › WhatsApp, para provar que o envio funciona. */
export function TesteEnvio() {
  const [numero, setNumero] = useState('')
  const [estado, setEstado] = useState<'' | 'enviando' | ResultadoEnvio>('')
  return (
    <div className="space-y-2 rounded-2xl border border-line p-3">
      <p className="label">Mensagem de teste</p>
      <div className="flex gap-2">
        <input className="input" placeholder="Seu WhatsApp, ex.: 96999998888" inputMode="tel" value={numero} onChange={e => setNumero(e.target.value)} />
        <button className="btn-send" disabled={numero.replace(/\D/g, '').length < 10 || estado === 'enviando'}
          onClick={async () => { setEstado('enviando'); setEstado(await enviarWhatsApp(numero, 'Teste do Painel da Cria: o WhatsApp da clínica está enviando mensagens. ✅')) }}>
          {estado === 'enviando' ? 'Enviando…' : 'Enviar teste'}
        </button>
      </div>
      {typeof estado === 'object' && (estado.ok
        ? <p className="text-sm text-green-800 font-medium">Enviada. Confira no seu WhatsApp.</p>
        : <p className="text-sm text-red-700 font-medium">{estado.erro}{estado.planoB && <> · <a className="underline" href={estado.planoB} target="_blank" rel="noopener">abrir no WhatsApp</a></>}</p>)}
    </div>
  )
}
