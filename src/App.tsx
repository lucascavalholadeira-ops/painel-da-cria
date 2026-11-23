import { useState } from 'react'
import { Provider, useApp, supabase } from './store'
import { brl, valorParado, chamarHoje } from './data'
import { ConectarWhatsApp, useStatusWpp } from './whatsapp'
import { ChamarHoje, WhatsApp, Painel, Agenda, Sumidos, Resumo, Ajustes } from './screens'

type Papel = 'dona' | 'recepcao'
const TELAS = [
  { id: 'chamar', nome: 'Chamar hoje', icone: '📣' },
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
  const [papel, setPapel] = useState<Papel | null>(() => (sessionStorage.getItem('papel') as Papel) || null)
  if (!papel) return <Login onEntrar={p => { sessionStorage.setItem('papel', p); setPapel(p) }} />
  return <Shell papel={papel} sair={() => { sessionStorage.removeItem('papel'); setPapel(null) }} />
}

function Login({ onEntrar }: { onEntrar: (p: Papel) => void }) {
  const [wpp, setWpp] = useState(false)
  return (
    <div className="min-h-dvh bg-ink text-cream flex flex-col items-center justify-center p-6 gap-6">
      <img src="/logo-vertical.png" alt="Cria" className="w-44 -my-6" />
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">Painel da Cria</h1>
        <p className="text-cream/60 text-sm mt-1">Demonstração · Clínica Elizabeth</p>
      </div>
      {wpp ? (
        <div className="w-full max-w-xs space-y-3">
          <p className="text-center font-bold">Entrar com o WhatsApp da clínica</p>
          <ConectarWhatsApp escuro onConectado={() => onEntrar('dona')} />
          <button className="text-sm text-cream/60 underline w-full" onClick={() => setWpp(false)}>Voltar</button>
        </div>
      ) : (
      <div className="w-full max-w-xs space-y-3">
        <button className="btn w-full bg-green-600 text-white py-3" onClick={() => setWpp(true)}>Entrar com WhatsApp</button>
        <p className="text-center text-xs text-cream/40">ou</p>
        <input className="input bg-white/5 border-white/10 text-cream" defaultValue="elizabeth@clinica.com.br" />
        <input className="input bg-white/5 border-white/10 text-cream" type="password" defaultValue="demonstracao" />
        <button className="btn w-full bg-cream text-ink py-3" onClick={() => onEntrar('dona')}>Entrar como dona</button>
        <button className="btn w-full bg-white/10 text-cream py-3" onClick={() => onEntrar('recepcao')}>Entrar como recepção</button>
      </div>
      )}
      <img src="/mascote.webp" alt="" className="w-28 opacity-90" />
    </div>
  )
}

function Shell({ papel, sair }: { papel: Papel; sair: () => void }) {
  const { s, aviso, toast } = useApp()
  const [tela, setTela] = useState('chamar')
  const telas = TELAS.filter(t => !t.soDona || papel === 'dona')
  const { st: wpp } = useStatusWpp()
  const pendentes = chamarHoje(s).length
  const novos = s.contacts.filter(c => c.novo).length
  const badge = (id: string) => (id === 'chamar' ? pendentes : id === 'whats' ? novos : 0)
  const diasAtivo = Math.round((Date.now() - new Date(s.clinica.ativacao + 'T12:00:00').getTime()) / 86400000)

  const corpo = {
    chamar: <ChamarHoje />, whats: <WhatsApp />, painel: <Painel />, agenda: <Agenda />,
    sumidos: <Sumidos />, resumo: <Resumo />, ajustes: papel === 'dona' ? <Ajustes /> : null,
  }[tela]

  return (
    <div className="min-h-dvh md:flex">
      {/* menu lateral (computador) */}
      <aside className="no-print hidden md:flex w-56 shrink-0 bg-ink text-cream flex-col p-3 gap-1 sticky top-0 h-dvh">
        <img src="/logo.png" alt="Cria" className="h-20 object-cover object-center -mx-2 mb-2" />
        {telas.map(t => (
          <button key={t.id} onClick={() => setTela(t.id)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-left ${tela === t.id ? 'bg-cream text-ink' : 'hover:bg-white/10'}`}>
            <span>{t.icone}</span><span className="flex-1">{t.nome}</span>
            {badge(t.id) > 0 && <span className="rounded-full bg-green-600 text-white text-xs px-2">{badge(t.id)}</span>}
          </button>
        ))}
        <div className="mt-auto text-xs text-cream/50 px-3 space-y-1">
          <p>{papel === 'dona' ? 'Elizabeth (dona)' : 'Recepção'}</p>
          <p>{supabase ? 'Salvo no Supabase' : 'Salvo neste navegador'}</p>
          <button className="underline" onClick={sair}>Sair</button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* topo com valor parado */}
        <header className="no-print sticky top-0 z-20 bg-paper/90 backdrop-blur border-b border-black/5 px-4 py-3 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="w-9 h-9 md:hidden" />
          <div className="min-w-0">
            <p className="text-xs text-black/50 font-semibold">{s.clinica.nome}</p>
            <p className="font-extrabold text-lg leading-tight">{TELAS.find(t => t.id === tela)?.nome}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] uppercase tracking-wide text-black/50 font-bold">Dinheiro parado</p>
            <p className="text-2xl md:text-3xl font-extrabold text-amber-600 leading-none">{brl(valorParado(s))}</p>
          </div>
          <button className="md:hidden text-xs text-black/50 underline" onClick={sair}>Sair</button>
        </header>

        {wpp?.configurado && wpp.estado !== 'open' && (
          <button onClick={() => papel === 'dona' && setTela('ajustes')} className="no-print bg-red-600 text-white text-sm font-semibold px-4 py-2 text-left">
            ⚠️ WhatsApp desconectado. {papel === 'dona' ? 'Toque para conectar em Ajustes.' : 'Avise a dona.'}
          </button>
        )}
        <main className="flex-1 p-4 pb-28 md:pb-6 max-w-6xl w-full mx-auto">{corpo}</main>
      </div>

      {/* menu de baixo (celular) */}
      <nav className="no-print md:hidden fixed bottom-0 inset-x-0 z-30 bg-ink text-cream flex overflow-x-auto">
        {telas.map(t => (
          <button key={t.id} onClick={() => setTela(t.id)}
            className={`relative flex-1 min-w-16 py-2 flex flex-col items-center text-[10px] font-semibold ${tela === t.id ? 'text-cream' : 'text-cream/50'}`}>
            <span className="text-lg">{t.icone}</span>{t.nome}
            {badge(t.id) > 0 && <span className="absolute top-1 right-3 rounded-full bg-green-600 text-white text-[10px] px-1.5">{badge(t.id)}</span>}
          </button>
        ))}
      </nav>

      {diasAtivo <= 7 && (
        <button onClick={() => toast('Na versão real, abre o WhatsApp do Lucas')}
          className="no-print fixed right-4 bottom-20 md:bottom-6 z-30 btn-dark shadow-lg rounded-full">🙋 Falar com o Lucas</button>
      )}
      {aviso && <div className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-8 z-50 bg-ink text-cream rounded-xl px-4 py-2 text-sm shadow-lg">{aviso}</div>}
    </div>
  )
}
