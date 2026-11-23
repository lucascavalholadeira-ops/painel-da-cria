import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import { seed, type State } from './data'

// Sem Supabase configurado, a demo guarda tudo no navegador (localStorage).
// Com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY, o estado é salvo na tabela demo_state.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabase = url && key ? createClient(url, key) : null
const LS = 'painel-da-cria-demo-v1'

function carregarLocal(): State {
  try { const r = localStorage.getItem(LS); if (r) return JSON.parse(r) } catch { /* sem storage */ }
  return seed()
}

type Ctx = { s: State; set: (fn: (s: State) => State) => void; reset: () => void; toast: (t: string) => void; aviso: string }
const C = createContext<Ctx>(null!)
export const useApp = () => useContext(C)

export function Provider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(carregarLocal)
  const [aviso, setAviso] = useState('')
  const pronto = useRef(!supabase)

  useEffect(() => {
    if (!supabase) return
    supabase.from('demo_state').select('data').eq('id', 'default').maybeSingle().then(({ data }) => {
      if (data?.data) setS(data.data as State)
      pronto.current = true
    })
  }, [])

  useEffect(() => {
    try { localStorage.setItem(LS, JSON.stringify(s)) } catch { /* sem storage */ }
    if (!supabase || !pronto.current) return
    const t = setTimeout(() => { supabase.from('demo_state').upsert({ id: 'default', data: s }).then() }, 600)
    return () => clearTimeout(t)
  }, [s])

  const toast = (t: string) => { setAviso(t); setTimeout(() => setAviso(''), 2600) }
  return <C.Provider value={{ s, set: setS, reset: () => setS(seed()), toast, aviso }}>{children}</C.Provider>
}
