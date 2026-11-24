import { useEffect, useState } from 'react'
import { useApp, DEMO } from './store'
import { sincronizarConversas, type ConversaReal } from './data'

/** Liga a leitura das conversas reais? Fora da demonstração já vem ligada. */
export const usarConversasReais = (v?: boolean) => v ?? !DEMO

/** Pede uma sincronização agora (o site conecta no WhatsApp, puxa as novas e desconecta). */
export const sincronizarAgora = () => window.dispatchEvent(new Event('wpp-sync'))

/**
 * Com o painel aberto: a cada 60 s o site conecta no WhatsApp, puxa as mensagens novas para o Supabase e desconecta.
 * A lista de conversas é lida do Supabase a cada 5 s.
 */
export function SyncWhatsApp() {
  const { s, set } = useApp()
  const ligado = usarConversasReais(s.clinica.conversasReais)
  useEffect(() => {
    if (!ligado) return
    let vivo = true, sincronizando = false
    const lerConversas = async () => {
      try {
        const r = await fetch('/api/wpp?action=conversas')
        if (!r.ok) return
        const { conversas } = await r.json() as { conversas: ConversaReal[] }
        if (vivo && conversas?.length) set(st => sincronizarConversas(st, conversas))
      } catch { /* sem conexão: tenta no próximo ciclo */ }
    }
    const sincronizar = async () => {
      if (sincronizando || document.hidden) return
      sincronizando = true
      try { await fetch('/api/wpp?action=sincronizar', { method: 'POST' }) } catch { /* tenta depois */ }
      sincronizando = false
      lerConversas()
    }
    lerConversas(); sincronizar()
    const t1 = setInterval(lerConversas, 5000), t2 = setInterval(sincronizar, 60000)
    window.addEventListener('wpp-sync', sincronizar)
    return () => { vivo = false; clearInterval(t1); clearInterval(t2); window.removeEventListener('wpp-sync', sincronizar) }
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
    const puxar = () => fetch(`/api/wpp?action=mensagens&fone=${encodeURIComponent(fone.includes('@') ? fone : fone.replace(/\D/g, ''))}`).then(r => r.json())
      .then(j => { if (vivo && j.mensagens) setMsgs(j.mensagens) }).catch(() => {})
    puxar(); const t = setInterval(puxar, 4000)
    return () => { vivo = false; clearInterval(t) }
  }, [fone, tick])
  return { msgs, recarregar: () => setTick(x => x + 1) }
}
