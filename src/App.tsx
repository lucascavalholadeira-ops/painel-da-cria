import { useEffect, useState } from 'react'
import { Provider, useApp, supabase, DEMO, type Tela } from './store'
import { brl, valorParado, chamarHoje, T } from './data'
import { useStatusWpp } from './whatsapp'
import { SyncWhatsApp } from './sync'
import { ChamarHoje, WhatsApp, Painel, Agenda, Sumidos, Resumo, Ajustes, Ajuda } from './screens'

type Papel = 'dona' | 'recepcao'
const TELAS: { id: Tela; nome: string; icone: string; soDona?: boolean }[] = [
  { id: 'chamar', nome: 'Chamar hoje', icone: '☀️' },
  { id: 'whats', nome: 'WhatsApp', icone: '💬' },
  { id: 'painel', nome: 'Painel', icone: '🗂️' },
  { id: 'agenda', nome: 'Agenda', icone: '📅' },
  { id: 'sumidos', nome: 'Sumidos', icone: '👋' },
  { id: 'resumo', nome: 'Resumo', icone: '📊' },
  { id: 'ajustes', nome: 'Ajustes', icone: '⚙️', soDona: true },
]

export default function App() {
  return <Provider><Raiz /></Provider>
}

function Raiz() {
  const [papel, setPapel] = useState<Papel | null>(() => { try { return sessionStorage.getItem('papel') as Papel } catch { return null } })
  const entrar = (p: Papel | null) => { try { if (p) sessionStorage.setItem('papel', p); else sessionStorage.removeItem('papel') } catch { /* sem storage */ } setPapel(p) }
  if (!papel) return <Login onEntrar={entrar} />
  return <Shell papel={papel} sair={() => { fetch('/api/login', { method: 'DELETE' }).catch(() => {}); entrar(null) }} />
}

export function Marca({ grande = false }: { grande?: boolean }) {
  const { s } = useApp()
  return (
    <div className={`flex items-center ${grande ? 'flex-col gap-3 text-center' : 'gap-2.5'}`}>
      <img src="/ortoclin-mark.png" alt="" className={grande ? 'h-20' : 'h-10'} />
      <div className="leading-tight">
        <p className={`marca ${grande ? 'text-4xl' : 'text-2xl'}`}>{s.clinica.nome}</p>
        <p className={`text-muted ${grande ? 'text-sm' : 'text-[10px]'} tracking-[.08em] uppercase`}>{s.clinica.subtitulo}</p>
      </div>
    </div>
  )
}

function Login({ onEntrar }: { onEntrar: (p: Papel) => void }) {
  const [exige, setExige] = useState<boolean | null>(null)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  useEffect(() => {
    fetch('/api/login').then(r => r.json()).then(j => setExige(!!j.exigeSenha)).catch(() => setExige(false))
  }, [])
  async function entrar(p: Papel) {
    if (!exige) return onEntrar(p)
    setCarregando(true); setErro('')
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha }) })
      if (r.ok) onEntrar(p); else setErro((await r.json()).erro ?? 'Não foi possível entrar')
    } catch { setErro('Sem conexão. Tente de novo.') }
    setCarregando(false)
  }
  return (
    <div className="min-h-dvh flex items-center justify-center p-5 bg-[linear-gradient(160deg,#F6EBD0,#FBF7EE_45%,#fff)]">
      <form className="card w-full max-w-sm p-7 space-y-6" onSubmit={e => { e.preventDefault(); entrar('dona') }}>
        <Marca grande />
        <div className="space-y-3">
          <div><label className="label">Senha do painel</label>
            <input className="input" type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} placeholder={exige === false ? 'Sem senha nesta instalação' : ''} /></div>
          {erro && <p className="text-sm text-red-700 font-medium">{erro}</p>}
          <button type="submit" className="btn-gold w-full py-3" disabled={carregando || exige === null || (!!exige && !senha)}>Entrar como Dra. Elizabeth</button>
          <button type="button" className="btn-ghost w-full py-3" disabled={carregando || exige === null || (!!exige && !senha)} onClick={() => entrar('recepcao')}>Entrar como recepção</button>
        </div>
        {DEMO && <p className="text-center text-xs text-muted">Demonstração com pacientes fictícios</p>}
      </form>
    </div>
  )
}

function Shell({ papel, sair }: { papel: Papel; sair: () => void }) {
  const { s, aviso, toast, tela, setTela } = useApp()
  const telas = TELAS.filter(t => !t.soDona || papel === 'dona')
  const { st: wpp } = useStatusWpp(DEMO ? 0 : 60000)
  const wppCaiu = !DEMO && wpp?.configurado && wpp.estado !== 'open'
  const pendentes = chamarHoje(s).length
  const novos = s.contacts.filter(c => c.tagId === T.novo).length
  const badge = (id: Tela) => (id === 'chamar' ? pendentes : id === 'whats' ? novos : 0)
  const diasAtivo = Math.round((Date.now() - new Date(s.clinica.ativacao + 'T12:00:00').getTime()) / 86400000)
  const atual = tela === 'ajustes' && papel !== 'dona' ? 'chamar' : tela

  const corpo = {
    chamar: <ChamarHoje />, whats: <WhatsApp />, painel: <Painel />, agenda: <Agenda />,
    sumidos: <Sumidos />, resumo: <Resumo />, ajustes: <Ajustes />,
  }[atual]

  const Ponto = ({ id }: { id: Tela }) => (id === 'whats' && wppCaiu ? <span title="WhatsApp desconectado" className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" /> : null)

  return (
    <div className="min-h-dvh md:flex">
      <SyncWhatsApp />
      <aside className="no-print hidden md:flex w-60 shrink-0 bg-white border-r border-line flex-col p-4 gap-1 sticky top-0 h-dvh">
        <div className="px-2 pt-1 pb-5"><Marca /></div>
        {telas.map(t => (
          <button key={t.id} onClick={() => setTela(t.id)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-left transition ${atual === t.id ? 'bg-gold-soft text-ink font-semibold shadow-[inset_3px_0_0_#B8913F]' : 'text-muted hover:bg-cream hover:text-ink'}`}>
            <span className="relative">{t.icone}<Ponto id={t.id} /></span><span className="flex-1">{t.nome}</span>
            {badge(t.id) > 0 && <span className="rounded-full bg-gold text-white text-[11px] font-bold px-2 py-0.5">{badge(t.id)}</span>}
          </button>
        ))}
        <div className="mt-auto px-3 space-y-1 text-xs text-muted">
          <p className="font-medium text-ink">{papel === 'dona' ? 'Dra. Elizabeth' : 'Recepção'}</p>
          {!DEMO && <p>{supabase ? 'Salvo no Supabase' : 'Salvo neste navegador'}</p>}
          <button className="underline hover:text-ink" onClick={sair}>Sair</button>
          <p className="pt-3 text-[10px] text-muted/70">Feito pela Cria</p>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="no-print sticky top-0 z-20 bg-cream/90 backdrop-blur border-b border-line px-4 md:px-6 py-3 flex items-center gap-3">
          <img src="/ortoclin-mark.png" alt="" className="h-9 md:hidden" />
          <div className="min-w-0">
            <p className="text-[11px] text-muted font-medium uppercase tracking-wider">{s.clinica.nome}</p>
            <h1 className="text-2xl leading-tight">{TELAS.find(t => t.id === atual)?.nome}</h1>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] uppercase tracking-wider text-muted font-semibold flex items-center justify-end gap-1">Parado <Ajuda texto="Parado é a soma dos orçamentos em dúvida mais o que falta dos planos que fecharam só uma parte." /></p>
            <p className="font-serif font-semibold text-3xl md:text-4xl leading-none text-gold">{brl(valorParado(s))}</p>
          </div>
          <button className="md:hidden text-xs text-muted underline" onClick={sair}>Sair</button>
        </header>
        <main className={`flex-1 p-4 md:p-6 pb-28 md:pb-8 w-full mx-auto ${atual === 'painel' ? 'max-w-none' : 'max-w-6xl'}`}>{corpo}</main>
      </div>

      <nav className="no-print md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-line flex overflow-x-auto shadow-[0_-4px_16px_rgba(43,38,32,0.05)]">
        {telas.map(t => (
          <button key={t.id} onClick={() => setTela(t.id)}
            className={`relative flex-1 min-w-0 py-2 flex flex-col items-center gap-0.5 text-[9.5px] leading-tight font-semibold whitespace-nowrap ${atual === t.id ? 'text-gold' : 'text-muted'}`}>
            <span className="relative text-lg">{t.icone}<Ponto id={t.id} /></span>{t.nome}
            {badge(t.id) > 0 && <span className="absolute top-0.5 right-1 rounded-full bg-gold text-white text-[10px] px-1.5">{badge(t.id)}</span>}
          </button>
        ))}
      </nav>

      {diasAtivo <= 7 && (
        <button onClick={() => toast('Abre o WhatsApp do Lucas, da Cria')} className="no-print fixed right-4 bottom-20 md:bottom-6 z-30 btn-ghost shadow-lg rounded-full">🙋 Falar com o Lucas</button>
      )}
      {aviso && <div className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-8 z-50 bg-ink text-white rounded-xl px-4 py-2.5 text-sm shadow-lg max-w-[90vw]">{aviso}</div>}
    </div>
  )
}
