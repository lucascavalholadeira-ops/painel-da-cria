import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { seed, type State } from './data'

// Os dados do painel ficam no Supabase (via /api/estado), para dona e recepção verem o mesmo em qualquer aparelho.
// Sem Supabase configurado, ficam só neste navegador (localStorage).
const LS = 'painel-ortoclin-demo-v1'

function carregarLocal(): State {
  try { const r = localStorage.getItem(LS); if (r) return JSON.parse(r) } catch { /* sem storage */ }
  return seed()
}

export type Tela = 'chamar' | 'whats' | 'painel' | 'agenda' | 'sumidos' | 'resumo' | 'ajustes'
export type PreAgendar = { contactId: string; serviceId?: string } | null
type Ctx = {
  s: State; set: (fn: (s: State) => State) => void; reset: () => void; toast: (t: string) => void; aviso: string
  tela: Tela; setTela: (t: Tela) => void; pre: PreAgendar; irAgendar: (contactId: string, serviceId?: string) => void; limparPre: () => void
  nuvem: boolean; ligarNuvem: () => void
}
/** Modo demonstração: dados fictícios e WhatsApp sem avisos. Desligue com VITE_DEMO=false. */
export const DEMO = import.meta.env.VITE_DEMO !== 'false'
const C = createContext<Ctx>(null!)
export const useApp = () => useContext(C)

export function Provider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(carregarLocal)
  const [aviso, setAviso] = useState('')
  const [tela, setTela] = useState<Tela>('chamar')
  const [pre, setPre] = useState<PreAgendar>(null)
  const [nuvem, setNuvem] = useState(false)
  const versao = useRef<string | null>(null)
  const enviado = useRef('')
  const pendente = useRef(false)
  const atual = useRef(s); atual.current = s

  /** Busca o estado no Supabase; na primeira vez (vazio), sobe o que está neste navegador. */
  const puxar = useCallback(async () => {
    try {
      const r = await fetch('/api/estado'); if (!r.ok) return
      const j = await r.json(); if (!j.ativo) return
      setNuvem(true)
      if (j.data) {
        if (j.versao !== versao.current && !pendente.current) { versao.current = j.versao; enviado.current = JSON.stringify(j.data); setS(j.data) }
      } else {
        const corpo = JSON.stringify(atual.current)
        const p = await fetch('/api/estado', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: atual.current }) })
        if (p.ok) { versao.current = (await p.json()).versao; enviado.current = corpo }
      }
    } catch { /* sem conexão: segue com o que tem */ }
  }, [])

  // a cada 15 s, traz o que a outra pessoa mudou
  useEffect(() => {
    if (!nuvem) return
    const t = setInterval(puxar, 15000)
    return () => clearInterval(t)
  }, [nuvem, puxar])

  // grava a cada mudança (1 s depois da última)
  useEffect(() => {
    try { localStorage.setItem(LS, JSON.stringify(s)) } catch { /* sem storage */ }
    if (!nuvem) return
    const corpo = JSON.stringify(s)
    if (corpo === enviado.current) return
    pendente.current = true
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/estado', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: s }) })
        if (r.ok) { versao.current = (await r.json()).versao; enviado.current = corpo }
      } catch { /* tenta na próxima mudança */ }
      pendente.current = false
    }, 1000)
    return () => clearTimeout(t)
  }, [s, nuvem])

  const toast = (t: string) => { setAviso(t); setTimeout(() => setAviso(''), 2600) }
  return <C.Provider value={{
    s, set: setS, reset: () => setS(seed()), toast, aviso, tela, setTela, pre,
    irAgendar: (contactId, serviceId) => { setPre({ contactId, serviceId }); setTela('agenda') }, limparPre: () => setPre(null),
    nuvem, ligarNuvem: puxar,
  }}>{children}</C.Provider>
}
