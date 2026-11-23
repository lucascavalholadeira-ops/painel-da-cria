import { useCallback, useEffect, useState } from 'react'

export interface StatusWpp {
  configurado: boolean
  erro?: string
  estado?: 'open' | 'close' | 'connecting' | 'sem_instancia'
  perfil?: { nome: string | null; numero: string | null; foto: string | null } | null
}

const api = async (action: string, post = false, extra = '') => {
  const r = await fetch(`/api/evolution?action=${action}${extra}`, { method: post ? 'POST' : 'GET' })
  return r.json()
}

/** Status da conexão, consultado a cada `intervalo` ms. */
export function useStatusWpp(intervalo = 30000) {
  const [st, setSt] = useState<StatusWpp | null>(null)
  const atualizar = useCallback(() => api('status').then(setSt).catch(() => setSt(null)), [])
  useEffect(() => { atualizar(); const t = setInterval(atualizar, intervalo); return () => clearInterval(t) }, [atualizar, intervalo])
  return { st, atualizar }
}

const fmtNumero = (n?: string | null) => (n ? n.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, '+$1 $2 $3-$4') : '')

/** Conecta o WhatsApp da clínica por QR code (ou código de pareamento no celular). */
export function ConectarWhatsApp({ onConectado, escuro = false }: { onConectado?: (s: StatusWpp) => void; escuro?: boolean }) {
  const { st, atualizar } = useStatusWpp(3000)
  const [qr, setQr] = useState<string | null>(null)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [numero, setNumero] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const conectado = st?.estado === 'open'

  useEffect(() => { if (conectado && st) { setQr(null); setCodigo(null); onConectado?.(st) } }, [conectado]) // eslint-disable-line

  async function gerar(comNumero = false) {
    setCarregando(true); setErro('')
    try {
      const d = numero.replace(/\D/g, ''); const n = d.length <= 11 ? '55' + d : d
      const r = await api('conectar', true, comNumero ? `&numero=${n}` : '')
      if (r.erro) setErro(r.erro)
      setQr(r.qr ?? null); setCodigo(comNumero ? r.codigo ?? null : null)
      atualizar()
    } catch { setErro('Não consegui falar com o servidor do WhatsApp') }
    setCarregando(false)
  }

  // O QR do WhatsApp expira em ~40s: renova enquanto estiver na tela.
  useEffect(() => { if (!qr || conectado) return; const t = setTimeout(() => gerar(), 35000); return () => clearTimeout(t) }, [qr, conectado]) // eslint-disable-line

  const sub = escuro ? 'text-cream/60' : 'text-cream/60'
  if (!st) return <p className={`text-sm ${sub}`}>Verificando WhatsApp…</p>
  if (st.erro) return <p className="text-sm text-red-500 font-semibold">{st.erro}. Tente de novo em instantes.</p>
  if (!st.configurado) return <p className={`text-sm ${sub}`}>WhatsApp não configurado nesta instalação (falta EVOLUTION_API_URL e EVOLUTION_API_KEY).</p>

  if (conectado) return (
    <div className="flex items-center gap-3">
      {st.perfil?.foto ? <img src={st.perfil.foto} className="w-12 h-12 rounded-full" alt="" /> : <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-xl">✓</div>}
      <div className="flex-1 min-w-0">
        <p className="font-bold">WhatsApp conectado</p>
        <p className={`text-sm ${sub}`}>{st.perfil?.nome} {fmtNumero(st.perfil?.numero)}</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      {qr ? (
        <div className="space-y-2">
          <img src={qr} alt="QR code do WhatsApp" className="w-56 h-56 bg-card rounded-2xl p-2 mx-auto" />
          <p className={`text-xs text-center ${sub}`}>No celular da clínica: WhatsApp › Aparelhos conectados › Conectar aparelho › aponte para o código.</p>
        </div>
      ) : codigo ? (
        <div className="text-center space-y-2">
          <p className="text-3xl font-extrabold tracking-[.3em]">{codigo}</p>
          <p className={`text-xs ${sub}`}>WhatsApp › Aparelhos conectados › Conectar aparelho › Conectar com número de telefone › digite este código.</p>
        </div>
      ) : null}
      <button className={`btn w-full py-3 bg-cream text-ink`} disabled={carregando} onClick={() => gerar()}>
        {carregando ? 'Gerando…' : qr ? 'Gerar outro QR code' : 'Mostrar QR code'}
      </button>
      <details className={`text-xs ${sub}`}>
        <summary className="cursor-pointer">Está no celular? Conectar com código</summary>
        <div className="flex gap-2 mt-2">
          <input className={`input ${escuro ? 'bg-white/5 border-white/10 text-cream' : ''}`} placeholder="DDD + número, ex.: 11999998888" inputMode="tel" value={numero} onChange={e => setNumero(e.target.value)} />
          <button className="btn-send" disabled={numero.replace(/\D/g, '').length < 10 || carregando}
            onClick={() => gerar(true)}>Gerar</button>
        </div>
      </details>
      {erro && <p className="text-sm text-red-500 font-semibold">{erro}</p>}
    </div>
  )
}

export function Desconectar({ depois }: { depois?: () => void }) {
  const [ok, setOk] = useState(false)
  return <button className="btn-ghost text-red-400" disabled={ok} onClick={async () => {
    if (!confirm('Desconectar o WhatsApp da clínica?')) return
    setOk(true); await api('sair', true); depois?.(); location.reload()
  }}>Desconectar WhatsApp</button>
}
