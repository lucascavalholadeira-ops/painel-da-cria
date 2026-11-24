import { useEffect, useState } from 'react'
import { useApp, DEMO } from './store'
import { sincronizarConversas, type ConversaReal } from './data'

/** Liga a leitura das conversas reais? Fora da demonstração já vem ligada. */
export const usarConversasReais = (v?: boolean) => v ?? !DEMO

/** Busca as conversas do WhatsApp da clínica a cada 5 segundos e atualiza o painel. */
export function SyncWhatsApp() {
  const { s, set } = useApp()
  const ligado = usarConversasReais(s.clinica.conversasReais)
  useEffect(() => {
    if (!ligado) return
    let vivo = true
    const puxar = async () => {
      try {
        const r = await fetch('/api/evolution?action=conversas')
        if (!r.ok) return
        const { conversas } = await r.json() as { conversas: ConversaReal[] }
        if (vivo && conversas?.length) set(st => sincronizarConversas(st, conversas))
      } catch { /* sem conexão: tenta de novo no próximo ciclo */ }
    }
    puxar(); const t = setInterval(puxar, 5000)
    return () => { vivo = false; clearInterval(t) }
  }, [ligado, set])
  return null
}

export interface MsgReal { id: string; deMim: boolean; texto: string; ts: number }

/** Mensagens reais de uma conversa aberta, atualizadas a cada 4 segundos. */
export function useMensagensReais(fone: string | null) {
  const [msgs, setMsgs] = useState<MsgReal[] | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    setMsgs(null)
    if (!fone) return
    let vivo = true
    const puxar = () => fetch(`/api/evolution?action=mensagens&fone=${fone.replace(/\D/g, '')}`).then(r => r.json())
      .then(j => { if (vivo && j.mensagens) setMsgs(j.mensagens) }).catch(() => {})
    puxar(); const t = setInterval(puxar, 4000)
    return () => { vivo = false; clearInterval(t) }
  }, [fone, tick])
  return { msgs, recarregar: () => setTick(x => x + 1) }
}
