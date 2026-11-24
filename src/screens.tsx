import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApp, DEMO } from './store'
import { useMensagensReais, usarConversasReais, sincronizarAgora } from './sync'
import { ConectarWhatsApp, Desconectar, TesteEnvio, enviarWhatsApp, useStatusWpp } from './whatsapp'
import {
  COLUNAS, ORIGENS, S, T, foneVisivel, addDias, brl, chamarHoje, conflito, dentroExpediente, diasDesde, durDe, emJogoHoje, esfriou, falta, fmtDia,
  hhmm, hm, hoje, intervalos, manutencoes, mensagem, primeiroHorarioLivre, primeiroNome, proximaEtapa, receberMensagem, sumidos, uid,
  valorFechado, valorParado,
  type Appt, type Coluna, type Etapa, type Origem, type Quote, type State, type StatusConsulta, type StatusManut, type TipoAviso,
} from './data'

// ---------- ações ----------
function enviar(s: State, contactId: string, texto: string, motivo: string, quoteId?: string): State {
  const d = hoje()
  return {
    ...s,
    msgs: [...s.msgs, { id: uid(), contactId, dir: 'out', texto, ts: Date.now() }],
    envios: [...s.envios, { contactId, dia: d, motivo }],
    quotes: s.quotes.map(q => (q.id === quoteId ? { ...q, ultimoContato: d, tentativas: q.tentativas + 1 } : q)),
  }
}

function aplicarEtiqueta(s: State, contactId: string, tagId: string): State {
  const tag = s.tags.find(t => t.id === tagId)
  const aberto = s.quotes.some(q => q.contactId === contactId && ['para_organizar', 'em_duvida', 'fechou_parcial'].includes(q.coluna))
  const quotes = tag?.painel && !aberto
    ? [...s.quotes, { id: uid(), contactId, serviceId: tagId === T.trat ? S.inst : S.aval, coluna: 'para_organizar' as Coluna, total: 0, fechado: 0, atentar: '', dataOrc: hoje(), ultimoContato: hoje(), tentativas: 0 }]
    : s.quotes
  const contacts = s.contacts.map(c => (c.id === contactId ? { ...c, tagId, manutencao: tagId === T.trat ? c.manutencao ?? 30 : c.manutencao } : c))
  return { ...s, quotes, contacts }
}

function marcarConsulta(s: State, a: Omit<Appt, 'id' | 'status'>): State {
  return {
    ...s,
    appts: [...s.appts, { ...a, id: uid(), status: 'marcado' }],
    // ao agendar, vira Cliente (quem está em tratamento com aparelho continua como está)
    contacts: s.contacts.map(c => (c.id === a.contactId && c.tagId !== T.trat ? { ...c, tagId: T.cli } : c)),
  }
}

/** Fora do modo demonstração, manda de verdade pelo WhatsApp da clínica. Na demonstração, só simula. */
function useDisparo() {
  const { s, toast } = useApp()
  return (fone: string, texto: string, nome: string, depois?: () => void) => {
    const real = s.contacts.find(x => x.fone === fone)?.real
    if (DEMO && !real) { toast(`Mensagem para ${primeiroNome(nome)} na fila do WhatsApp`); return }
    toast(`Enviando para ${primeiroNome(nome)}…`)
    enviarWhatsApp(fone, texto).then(r => {
      if (r.ok) { toast(`Enviada para ${primeiroNome(nome)} ✓`); depois?.() }
      else { toast(`⚠️ ${r.erro}. Abrindo no WhatsApp do celular.`); if (r.planoB) window.open(r.planoB, '_blank', 'noopener') }
    })
  }
}

// ---------- peças ----------
export function Ajuda({ texto }: { texto: string }) {
  const [aberto, setAberto] = useState(false)
  return (
    <span className="relative inline-flex normal-case tracking-normal">
      <button type="button" aria-label="O que é isso?" onClick={e => { e.stopPropagation(); setAberto(!aberto) }} onBlur={() => setAberto(false)}
        className="w-4 h-4 rounded-full border border-gold/60 text-gold text-[10px] font-bold leading-none flex items-center justify-center hover:bg-gold-soft">?</button>
      {aberto && <span className="absolute right-0 top-6 z-50 w-64 rounded-xl bg-ink text-white text-xs font-normal text-left p-3 shadow-xl">{texto}</span>}
    </span>
  )
}

const Vazio = ({ titulo, children }: { titulo: string; children?: ReactNode }) => (
  <div className="card p-10 text-center flex flex-col items-center gap-2">
    <img src="/ortoclin-mark.png" alt="" className="h-12 opacity-80 mb-2" />
    <h3 className="text-2xl">{titulo}</h3><p className="text-sm text-muted">{children}</p>
  </div>
)

function Modal({ titulo, fechar, children, largo = false }: { titulo: string; fechar: () => void; children: ReactNode; largo?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] flex items-end md:items-center justify-center" onClick={fechar}>
      <div className={`bg-white w-full ${largo ? 'md:max-w-xl' : 'md:max-w-md'} rounded-t-[22px] md:rounded-[22px] p-5 md:p-6 max-h-[92dvh] overflow-y-auto shadow-2xl`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start mb-4 gap-3"><h2 className="text-2xl flex-1 leading-tight">{titulo}</h2><button onClick={fechar} className="text-2xl leading-none text-muted hover:text-ink">×</button></div>
        {children}
      </div>
    </div>
  )
}

const Etiqueta = ({ s, tagId }: { s: State; tagId: string | null }) => {
  const t = s.tags.find(x => x.id === tagId)
  if (!t) return <span className="chip border-dashed border-line text-muted">Sem etiqueta</span>
  return <span className="chip" style={{ background: t.cor + '14', color: t.cor, borderColor: t.cor + '55' }}>{t.nome}</span>
}

const Avatar = ({ nome, foto }: { nome: string; foto?: string | null }) => foto
  ? <img src={foto} alt="" className="w-10 h-10 shrink-0 rounded-full object-cover border border-line" onError={e => { e.currentTarget.style.display = 'none' }} />
  : (
  <div className="w-10 h-10 shrink-0 rounded-full bg-gold-soft text-[#7a5f22] font-semibold text-sm flex items-center justify-center border border-gold-2/40">{nome.split(' ').map(p => p[0]).slice(0, 2).join('')}</div>
)

const Aviso = ({ tipo, children }: { tipo: TipoAviso | 'atentar'; children: ReactNode }) => {
  const cls: Record<string, string> = { esfriou: 'aviso-esfriou', sumida: 'aviso-sumida', atentar: 'aviso-atentar', manut: 'aviso-manut', plano: 'aviso-plano', agendar: 'aviso-agendar', retorno: 'aviso-retorno', indicacao: 'aviso-indicacao' }
  return <span className={`chip ${cls[tipo]} text-xs py-1 whitespace-normal rounded-lg`}>{children}</span>
}

const BotaoAgendar = ({ contactId, serviceId, pequeno = false }: { contactId: string; serviceId?: string; pequeno?: boolean }) => {
  const { irAgendar } = useApp()
  return <button className={`btn-ghost ${pequeno ? 'px-2.5 py-1 text-xs' : ''}`} onClick={e => { e.stopPropagation(); irAgendar(contactId, serviceId) }}>📅 Agendar</button>
}

// ---------- 1. Chamar hoje ----------
export function ChamarHoje() {
  const { s, set } = useApp()
  const disparar = useDisparo()
  const itens = chamarHoje(s)
  const [edit, setEdit] = useState<Record<string, string>>({})
  if (!itens.length) return <Vazio titulo="Tudo em dia por hoje.">Amanhã cedo aparece aqui quem precisa ser chamado.</Vazio>
  return (
    <div className="space-y-4">
      <div className="card p-4 md:p-5 flex flex-wrap items-center gap-x-6 gap-y-3 bg-[linear-gradient(160deg,#fff,#F3E7C9)]">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1">Em jogo hoje <Ajuda texto="Soma do que está na lista de hoje: orçamentos que esfriaram, retornos, o que falta dos planos, manutenções e pacientes sumidos." /></p>
          <p className="font-serif font-semibold text-3xl text-ink">{brl(emJogoHoje(s))}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Pessoas</p>
          <p className="font-serif font-semibold text-3xl text-ink">{itens.length}</p>
        </div>
        <p className="text-sm text-muted md:ml-auto">Leva uns 15 minutos. Revise a mensagem e toque em Enviar.</p>
      </div>
      {itens.map(i => {
        const k = i.contact.id + i.aviso
        const texto = edit[k] ?? i.texto
        return (
          <div key={k} className="card p-4 md:p-5">
            <div className="flex items-start gap-3">
              <Avatar nome={i.contact.nome} />
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="font-semibold">{i.contact.nome}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Aviso tipo={i.aviso}>{i.motivo}</Aviso>
                  {i.contact.atentar && <Aviso tipo="atentar">⚠️ {i.contact.atentar}</Aviso>}
                </div>
              </div>
              {i.valor > 0 && <p className="font-serif font-semibold text-xl">{brl(i.valor)}</p>}
            </div>
            <textarea className="input mt-3 min-h-20 bg-cream/50" value={texto} onChange={e => setEdit({ ...edit, [k]: e.target.value })} />
            <div className="flex justify-end gap-2 mt-3">
              {i.aviso !== 'indicacao' && <BotaoAgendar contactId={i.contact.id} serviceId={i.serviceId} />}
              <button className="btn-send px-6" onClick={() => { set(st => enviar(st, i.contact.id, texto, i.aviso === 'indicacao' ? 'indicacao' : i.aviso, i.quoteId)); disparar(i.contact.fone, texto, i.contact.nome) }}>Enviar ➤</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------- 2. WhatsApp ----------
export function WhatsApp() {
  const { s, set, toast } = useApp()
  const disparar = useDisparo()
  const [aberto, setAberto] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [lado, setLado] = useState(false)

  const lista = useMemo(() => s.contacts
    .map(c => {
      const local = s.msgs.filter(m => m.contactId === c.id).sort((a, b) => b.ts - a.ts)[0]
      const ult = c.ultima && (!local || c.ultima.ts >= local.ts) ? { dir: c.ultima.deMim ? 'out' : 'in', texto: c.ultima.texto, ts: c.ultima.ts } : local
      return { c, ult }
    })
    .filter(({ c }) => c.nome.toLowerCase().includes(busca.toLowerCase()) && (!filtro || c.tagId === filtro))
    .sort((a, b) => (b.ult?.ts ?? 0) - (a.ult?.ts ?? 0)), [s, busca, filtro])

  const c = s.contacts.find(x => x.id === aberto)
  const reais = useMensagensReais(c?.real ? c.fone : null)
  const msgs = c?.real && reais.msgs
    ? reais.msgs.map(m => ({ id: m.id, contactId: c.id, dir: m.deMim ? 'out' : 'in', texto: m.texto, ts: m.ts }))
    : s.msgs.filter(m => m.contactId === aberto).sort((a, b) => a.ts - b.ts)
  const card = s.quotes.find(q => q.contactId === aberto && q.coluna !== 'recusou')
  const consulta = s.appts.filter(a => a.contactId === aberto && a.data >= hoje() && a.status !== 'cancelado').sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))[0]
  const hora = (ts: number) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const editar = (campo: Partial<State['contacts'][number]>) => c && set(st => ({ ...st, contacts: st.contacts.map(x => (x.id === c.id ? { ...x, ...campo } : x)) }))

  const mandar = () => {
    if (!texto.trim() || !c) return
    if (c.real) disparar(c.fone, texto, c.nome, reais.recarregar)
    else { set(st => ({ ...st, msgs: [...st.msgs, { id: uid(), contactId: c.id, dir: 'out', texto, ts: Date.now() }] })); if (!DEMO) disparar(c.fone, texto, c.nome) }
    setTexto('')
  }
  const simularResposta = () => c && set(st => receberMensagem(st, c.nome, c.fone, 'Oi! Vi sua mensagem, quero sim.'))
  const simularSite = () => {
    const nomes = ['Luana Monteiro', 'Bruna Cardoso', 'Thaís Ribeiro', 'Paula Sena', 'Joana Matos']
    const nome = nomes[s.contacts.length % nomes.length]
    const fone = `+55 96 9${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`
    set(st => receberMensagem(st, nome, fone, 'Vim pelo site da OrtoClin e gostaria de agendar uma avaliação.'))
    toast(`${nome} chegou pelo site: origem Site, etiqueta Novo`)
  }

  const quem = s.contacts.find(x => x.id === menu)
  const abrirEtiqueta = (id: string) => (e: React.MouseEvent) => { e.stopPropagation(); setMenu(id) }

  return (
    <>
      <div className="card overflow-hidden md:grid md:grid-cols-[340px_1fr] h-[calc(100dvh-180px)] md:h-[calc(100dvh-130px)]">
        <div className={`${aberto ? 'hidden md:flex' : 'flex'} flex-col border-r border-line min-h-0 h-full`}>
          <div className="p-3 space-y-2 border-b border-line">
            <input className="input" placeholder="Buscar conversa" value={busca} onChange={e => setBusca(e.target.value)} />
            <div className="flex gap-1.5 overflow-x-auto text-xs pb-0.5">
              {[{ id: '', nome: 'Todas' }, ...s.tags].map(t => (
                <button key={t.id} onClick={() => setFiltro(t.id)} className={`rounded-full px-3 py-1 whitespace-nowrap font-medium border ${filtro === t.id ? 'bg-ink text-white border-ink' : 'bg-white border-line text-muted'}`}>{t.nome}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {usarConversasReais(s.clinica.conversasReais) && <button className="text-[11px] text-gold font-semibold underline" onClick={() => { sincronizarAgora(); toast('Buscando mensagens novas no WhatsApp…') }}>↻ Atualizar agora</button>}
              {DEMO && <button className="text-[11px] text-gold underline text-left" onClick={simularSite}>(demonstração) chegar mensagem “Vim pelo site da OrtoClin…”</button>}
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {lista.map(({ c, ult }) => (
              <div key={c.id} onClick={() => setAberto(c.id)} className={`flex gap-3 px-3 py-3 border-b border-line/70 cursor-pointer ${aberto === c.id ? 'bg-gold-soft/50' : 'hover:bg-cream'}`}>
                <Avatar nome={c.nome} foto={c.foto} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate flex-1">{c.nome}</p>
                    <span className="text-[11px] text-muted">{ult && hora(ult.ts)}</span>
                  </div>
                  <p className="text-sm text-muted truncate">{ult?.dir === 'out' && '✓✓ '}{ult?.texto}</p>
                  <button className="mt-1" onClick={abrirEtiqueta(c.id)}><Etiqueta s={s} tagId={c.tagId} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {c ? (
          <div className="flex flex-col min-h-0 h-full">
            <div className="flex items-center gap-2 p-3 border-b border-line bg-white">
              <button className="md:hidden text-xl px-1" onClick={() => setAberto(null)}>←</button>
              <Avatar nome={c.nome} foto={c.foto} />
              <div className="flex-1 min-w-0"><p className="font-semibold truncate">{c.nome}</p><p className="text-xs text-muted truncate">{foneVisivel(c.fone)} · {c.origem}{c.real && ' · WhatsApp real'}</p></div>
              <BotaoAgendar contactId={c.id} serviceId={card?.serviceId} pequeno />
              <button className="btn-soft px-2.5 py-1 text-xs" onClick={() => setLado(!lado)}>{lado ? 'Conversa' : 'Resumo'}</button>
            </div>
            {lado ? (
              <div className="p-4 space-y-4 overflow-y-auto text-sm">
                <div><p className="label">Etiqueta</p><button onClick={abrirEtiqueta(c.id)}><Etiqueta s={s} tagId={c.tagId} /></button></div>
                <div><p className="label">Origem</p>
                  <select className="input" value={c.origem} onChange={e => editar({ origem: e.target.value as Origem })}>{ORIGENS.map(o => <option key={o}>{o}</option>)}</select></div>
                <div><p className="label">No painel</p>{card ? <p>{COLUNAS.find(x => x.id === card.coluna)?.nome} · {s.services.find(x => x.id === card.serviceId)?.nome} · <b>{brl(card.total)}</b></p> : <p className="text-muted">Sem card</p>}</div>
                <div><p className="label">Algo a se atentar</p><input className="input" value={c.atentar} placeholder="Ex.: tem medo de agulha" onChange={e => editar({ atentar: e.target.value })} /></div>
                {c.manutencao && <div><p className="label">Manutenção do aparelho a cada (dias)</p><input className="input" inputMode="numeric" value={c.manutencao} onChange={e => editar({ manutencao: Number(e.target.value) || 30 })} /></div>}
                <div><p className="label">Próxima consulta</p>{consulta ? <p>{fmtDia(consulta.data)} às {consulta.hora} · {s.services.find(x => x.id === consulta.serviceId)?.nome}</p> : <p className="text-muted">Nenhuma</p>}</div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#efeae2]">
                  {msgs.map(m => (
                    <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.dir === 'out' ? 'ml-auto bg-[#d9fdd3]' : 'bg-white'}`}>
                      {m.texto}<span className="block text-right text-[10px] text-muted">{hora(m.ts)}{m.dir === 'out' && ' ✓✓'}</span>
                    </div>
                  ))}
                </div>
                <div className="p-2 flex gap-2 border-t border-line bg-white">
                  <input className="input" placeholder="Mensagem" value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && mandar()} />
                  <button className="btn-send" onClick={mandar}>➤</button>
                </div>
                {DEMO && !c.real && <button className="text-[11px] text-muted underline pb-2 bg-white" onClick={simularResposta}>(demonstração) simular resposta da paciente</button>}
              </>
            )}
          </div>
        ) : (
          <div className="hidden md:flex items-center justify-center text-muted flex-col gap-3 bg-cream/40">
            <img src="/ortoclin-mark.png" className="h-14 opacity-60" alt="" />Escolha uma conversa
          </div>
        )}
      </div>

      {quem && (
        <Modal titulo={`Etiqueta de ${primeiroNome(quem.nome)}`} fechar={() => setMenu(null)}>
          <div className="space-y-1">
            {s.tags.map(t => (
              <button key={t.id} className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left ${quem.tagId === t.id ? 'bg-gold-soft/70' : 'hover:bg-cream'}`}
                onClick={() => { set(st => aplicarEtiqueta(st, quem.id, t.id)); setMenu(null); if (t.painel) toast('Foi para o Painel em "Para organizar"') }}>
                <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: t.cor }} />
                <span className="flex-1 font-medium">{t.nome}</span>
                {t.painel && <span className="text-xs text-muted">vai para o Painel</span>}
                {quem.tagId === t.id && <span className="text-gold">✓</span>}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}

// ---------- 3. Painel ----------
export function Painel() {
  const { s, set, toast } = useApp()
  const disparar = useDisparo()
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [abrir, setAbrir] = useState<{ q: Quote; coluna: Coluna } | null>(null)

  return (
    <div>
      <p className="text-sm text-muted mb-4 hidden md:block">Arraste o card para a coluna certa. No celular, use “Mover para”.</p>
      <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
        {COLUNAS.map(col => {
          const cards = s.quotes.filter(q => q.coluna === col.id)
          const soma = cards.reduce((t, q) => t + (col.id === 'fechou_parcial' ? falta(q) : col.id === 'fechou' ? valorFechado(q) : q.total), 0)
          return (
            <div key={col.id} className="snap-start shrink-0 w-[82vw] sm:w-72 lg:w-auto lg:shrink lg:flex-1 lg:min-w-52 bg-[#F5EEDF] border border-line rounded-[22px] p-2.5 min-h-[calc(100dvh-220px)]"
              onDragOver={e => e.preventDefault()}
              onDrop={() => { const q = s.quotes.find(x => x.id === arrastando); if (q && q.coluna !== col.id) setAbrir({ q, coluna: col.id }); setArrastando(null) }}>
              <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: col.cor }} />
                <p className="font-semibold text-sm flex-1">{col.nome} <span className="text-muted font-normal">{cards.length}</span></p>
                {soma > 0 && <p className="text-xs font-semibold text-muted">{col.id === 'fechou_parcial' ? 'falta ' : ''}{brl(soma)}</p>}
              </div>
              <div className="space-y-2.5">
                {cards.map(q => {
                  const c = s.contacts.find(x => x.id === q.contactId)!
                  const frio = esfriou(s, q)
                  const prox = proximaEtapa(q)
                  return (
                    <div key={q.id} draggable onDragStart={() => setArrastando(q.id)} onClick={() => setAbrir({ q, coluna: q.coluna })}
                      className={`rounded-2xl border p-3.5 cursor-grab active:cursor-grabbing shadow-[0_1px_6px_rgba(43,38,32,0.05)] space-y-1.5 ${frio ? 'bg-sky-50 border-sky-200' : 'bg-white border-line'}`}>
                      <div className="flex items-start gap-2">
                        <p className="font-semibold flex-1">{c.nome}</p>
                        {q.total > 0 && <p className="font-serif font-semibold text-lg leading-none">{brl(q.total)}</p>}
                      </div>
                      <p className="text-xs text-muted">{s.services.find(x => x.id === q.serviceId)?.nome}{q.coluna === 'fechou_parcial' && ` · falta ${brl(falta(q))}`}</p>
                      {q.etapas && q.etapas.length > 1 && (
                        <div className="flex flex-wrap gap-1">{q.etapas.map(e => <span key={e.id} className={`chip ${e.situacao === 'feita' ? 'bg-green-50 text-green-800 border-green-200' : e.situacao === 'agendada' ? 'bg-sky-50 text-sky-800 border-sky-200' : 'bg-white text-muted border-line'}`}>{e.situacao === 'feita' ? '✓ ' : ''}{e.nome}</span>)}</div>
                      )}
                      {frio && <p className="text-xs font-semibold text-sky-900">❄️ esfriou · {diasDesde(q.ultimoContato)} dias sem contato</p>}
                      {prox && q.coluna === 'fechou_parcial' && <p className="text-xs text-[#6b531c]">Próxima etapa: <b>{prox.nome}</b></p>}
                      {(q.atentar || c.atentar) && <p className="text-xs text-amber-900">⚠️ {q.atentar || c.atentar}</p>}
                      <div className="flex gap-1.5 pt-1" onClick={e => e.stopPropagation()}>
                        <select className="flex-1 min-w-0 text-xs bg-cream border border-line rounded-lg px-2 py-1.5" value=""
                          onChange={e => setAbrir({ q, coluna: e.target.value as Coluna })}>
                          <option value="">Mover para…</option>
                          {COLUNAS.filter(x => x.id !== q.coluna).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                        </select>
                        <BotaoAgendar contactId={c.id} serviceId={q.serviceId} pequeno />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {abrir && <CardModal q={abrir.q} coluna={abrir.coluna} fechar={() => setAbrir(null)}
        salvar={(q, msg) => {
          set(st => {
            const antes = st.quotes.find(x => x.id === q.id)
            const recuperado = antes?.coluna === 'em_duvida' && ['fechou', 'fechou_parcial'].includes(q.coluna) && q.tentativas > 0
            let n = { ...st, quotes: st.quotes.map(x => (x.id === q.id ? { ...q, recuperado: x.recuperado || recuperado } : x)) }
            if (msg) n = enviar(n, q.contactId, msg, 'painel_' + q.coluna, q.id)
            return n
          })
          if (msg) { const ct = s.contacts.find(x => x.id === q.contactId)!; disparar(ct.fone, msg, ct.nome) } else toast('Card atualizado')
          setAbrir(null)
        }} />}
    </div>
  )
}

function CardModal({ q, coluna, fechar, salvar }: { q: Quote; coluna: Coluna; fechar: () => void; salvar: (q: Quote, msg?: string) => void }) {
  const { s } = useApp()
  const c = s.contacts.find(x => x.id === q.contactId)!
  const sv0 = s.services.find(x => x.id === q.serviceId)
  const comEtapas = coluna === 'fechou_parcial' || (q.etapas?.length ?? 0) > 0
  const [f, setF] = useState<Quote>(() => ({
    ...q, coluna, atentar: q.atentar || c.atentar, total: q.total || (sv0?.preco ?? 0),
    etapas: q.etapas?.length ? q.etapas : comEtapas
      ? [{ id: uid(), nome: sv0?.nome ?? 'Primeira etapa', valor: q.total || sv0?.preco || 0, situacao: 'feita' }, { id: uid(), nome: '', valor: 0, situacao: 'pendente' }]
      : undefined,
  }))
  const [msg, setMsg] = useState<string | null>(null)
  const sv = s.services.find(x => x.id === f.serviceId)
  const etapas = f.etapas?.filter(e => e.nome.trim() || e.valor) ?? []
  const totalPlano = etapas.length ? etapas.reduce((t, e) => t + e.valor, 0) : f.total
  const proxima = etapas.find(e => e.situacao === 'pendente')
  const ideia = mensagem(s, 'ideia_' + f.coluna, c, { procedimento: (sv?.nome ?? '').toLowerCase(), valor: brl(totalPlano), etapa: (proxima?.nome ?? 'o restante do plano').toLowerCase() })
  const texto = msg ?? ideia
  const num = (v: string) => Number(v.replace(/\D/g, '')) || 0
  const setEtapa = (id: string, campo: Partial<Etapa>) => setF({ ...f, etapas: f.etapas!.map(e => (e.id === id ? { ...e, ...campo } : e)) })

  const montar = (extra: Partial<Quote> = {}): Quote => {
    const base: Quote = { ...f, ...extra, etapas: etapas.length ? (extra.etapas ?? etapas) : undefined }
    const total = base.etapas?.length ? base.etapas.reduce((t, e) => t + e.valor, 0) : base.total
    return { ...base, total, fechado: base.coluna === 'fechou' ? total : base.etapas?.length ? valorFechado(base) : base.fechado }
  }
  const concluir = () => salvar(montar({ coluna: 'fechou', concluidoEm: hoje(), etapas: etapas.map(e => ({ ...e, situacao: 'feita' as const })) }))

  return (
    <Modal titulo={`${c.nome} → ${COLUNAS.find(x => x.id === coluna)?.nome}`} fechar={fechar} largo>
      <div className="space-y-4">
        <div><label className="label">Procedimento</label>
          <select className="input" value={f.serviceId} onChange={e => { const n = s.services.find(x => x.id === e.target.value)!; setF({ ...f, serviceId: n.id, total: f.total || n.preco }) }}>
            {s.services.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select></div>

        {f.etapas ? (
          <div className="rounded-2xl border border-line p-3 space-y-2">
            <p className="label">Plano de tratamento em etapas</p>
            {f.etapas.map(e => (
              <div key={e.id} className="grid grid-cols-[1fr_96px] sm:grid-cols-[1fr_100px_120px] gap-2">
                <input className="input" placeholder="Etapa (ex.: Clareamento)" value={e.nome} onChange={x => setEtapa(e.id, { nome: x.target.value })} />
                <input className="input" inputMode="numeric" placeholder="R$" value={e.valor ? brl(e.valor) : ''} onChange={x => setEtapa(e.id, { valor: num(x.target.value) })} />
                <select className="input col-span-2 sm:col-span-1" value={e.situacao} onChange={x => setEtapa(e.id, { situacao: x.target.value as Etapa['situacao'] })}>
                  <option value="feita">Feita</option><option value="agendada">Agendada</option><option value="pendente">Pendente</option>
                </select>
              </div>
            ))}
            <button className="text-xs text-gold font-semibold" onClick={() => setF({ ...f, etapas: [...f.etapas!, { id: uid(), nome: '', valor: 0, situacao: 'pendente' }] })}>+ Adicionar etapa</button>
            <div className="flex justify-between text-sm pt-1 border-t border-line">
              <span className="text-muted">Plano: <b className="text-ink">{brl(totalPlano)}</b></span>
              <span className="text-[#6b531c] font-semibold">Falta: {brl(etapas.filter(e => e.situacao === 'pendente').reduce((t, e) => t + e.valor, 0))}</span>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <div className="flex-1"><label className="label">Valor</label>
              <input className="input" inputMode="numeric" value={f.total ? brl(f.total) : ''} placeholder={sv ? brl(sv.preco) : 'R$'} onChange={e => setF({ ...f, total: num(e.target.value) })} /></div>
            <button className="btn-soft text-xs" onClick={() => setF({ ...f, etapas: [{ id: uid(), nome: sv?.nome ?? '', valor: f.total, situacao: 'pendente' }] })}>Dividir em etapas</button>
          </div>
        )}

        <div><label className="label">Algo a se atentar</label>
          <input className="input" placeholder="Ex.: tem medo de agulha, só pode à tarde" value={f.atentar} onChange={e => setF({ ...f, atentar: e.target.value })} /></div>
        <div className="rounded-2xl bg-gold-soft/50 border border-gold-2/40 p-3">
          <p className="label text-[#6b531c]">💡 Ideia do que enviar</p>
          <textarea className="input min-h-24" value={texto} onChange={e => setMsg(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost flex-1" onClick={() => salvar(montar())}>Agora não</button>
          <button className="btn-send flex-1" onClick={() => salvar(montar(), texto)}>Enviar agora ➤</button>
        </div>
        {(f.coluna === 'fechou' || f.coluna === 'fechou_parcial') && !q.concluidoEm && (
          <button className="text-xs text-muted underline w-full" onClick={concluir}>Marcar tratamento como concluído (em 7 dias sugerimos pedir indicação)</button>
        )}
      </div>
    </Modal>
  )
}

// ---------- 4. Agenda + Manutenções ----------
const STATUS: Record<StatusConsulta, { cor: string; nome: string }> = {
  marcado: { cor: '#8C8478', nome: 'Marcado' }, confirmado: { cor: '#2F6FA8', nome: 'Confirmado' }, realizado: { cor: '#3E7D3A', nome: 'Realizado' },
  faltou: { cor: '#B5544B', nome: 'Faltou' }, cancelado: { cor: '#B9B1A4', nome: 'Cancelado' },
}
const ALTURA = 44 // px por 30 min

export function Agenda() {
  const { s, set, toast, pre, limparPre } = useApp()
  const [aba, setAba] = useState<'agenda' | 'manut'>('agenda')
  const [dia, setDia] = useState(hoje())
  const [profMobile, setProfMobile] = useState(s.profs[0]?.id)
  const [novo, setNovo] = useState<{ profId: string; hora: string; dia: string; contactId?: string; serviceId?: string } | null>(null)
  const [ver, setVer] = useState<Appt | null>(null)
  const [arrasta, setArrasta] = useState<{ tipo: 'contato' | 'consulta'; id: string } | null>(null)

  // atalho "Agendar" vindo de outra tela: abre já com paciente, serviço e o primeiro horário livre
  useEffect(() => {
    if (!pre) return
    const sv = pre.serviceId ?? S.aval
    let d = hoje(), h: string | null = null
    for (let i = 0; i < 14 && !h; i++) { d = addDias(hoje(), i); h = primeiroHorarioLivre(s, s.profs[0].id, d, sv) }
    setAba('agenda'); setDia(d)
    setNovo({ profId: s.profs[0].id, hora: h ?? '08:00', dia: d, contactId: pre.contactId, serviceId: sv })
    limparPre()
  }, [pre]) // eslint-disable-line

  const todos = s.profs.flatMap(p => intervalos(p, dia))
  const inicio = Math.min(8 * 60, ...todos.map(x => x[0])), fim = Math.max(18 * 60, ...todos.map(x => x[1]))
  const slots = Array.from({ length: Math.ceil((fim - inicio) / 30) }, (_, i) => hhmm(inicio + i * 30))
  const esperando = s.contacts.filter(c => c.tagId === T.esp && !s.appts.some(a => a.contactId === c.id && a.data >= hoje() && a.status !== 'cancelado'))

  function problema(profId: string, d: string, hora: string, serviceId: string, ignorar?: string) {
    const p = s.profs.find(x => x.id === profId)!
    const ini = hm(hora), f = ini + durDe(s, serviceId)
    if (!dentroExpediente(p, d, ini, f)) return `Fora do expediente de ${p.nome}`
    const ch = conflito(s, profId, d, hora, serviceId, ignorar)
    return ch ? `${p.nome} já tem ${s.contacts.find(c => c.id === ch.contactId)?.nome} às ${ch.hora}` : ''
  }

  function soltar(profId: string, hora: string) {
    if (!arrasta) return
    if (arrasta.tipo === 'contato') setNovo({ profId, hora, dia, contactId: arrasta.id })
    else {
      const a = s.appts.find(x => x.id === arrasta.id)!
      const erro = problema(profId, dia, hora, a.serviceId, a.id)
      if (erro) toast('⛔ ' + erro)
      else { set(st => ({ ...st, appts: st.appts.map(x => (x.id === a.id ? { ...x, profId, hora, data: dia, confirmacao: undefined } : x)) })); toast('Consulta remarcada') }
    }
    setArrasta(null)
  }

  const coluna = (profId: string) => {
    const p = s.profs.find(x => x.id === profId)!
    const doDia = s.appts.filter(x => x.profId === profId && x.data === dia && x.status !== 'cancelado')
    return (
      <div key={profId} className={`flex-1 min-w-0 border-l border-line ${profId !== profMobile ? 'hidden md:block' : ''}`}>
        <p className="text-center font-semibold text-sm py-2.5 sticky top-0 z-10 bg-white border-b border-line" style={{ color: p.cor }}>{p.nome}</p>
        <div className="relative">
          {slots.map(h => {
            const fora = !dentroExpediente(p, dia, hm(h), hm(h) + 30)
            return (
              <div key={h} style={{ height: ALTURA }} className={`border-b border-line/60 ${fora ? 'bg-[repeating-linear-gradient(135deg,#F5EEDF,#F5EEDF_6px,#FBF7EE_6px,#FBF7EE_12px)]' : 'hover:bg-gold-soft/40 cursor-pointer'}`}
                onDragOver={e => e.preventDefault()} onDrop={() => soltar(profId, h)}
                onClick={() => (fora ? toast(`Fora do expediente de ${p.nome}`) : setNovo({ profId, hora: h, dia }))} />
            )
          })}
          {doDia.map(a => {
            const c = s.contacts.find(x => x.id === a.contactId)
            const dur = durDe(s, a.serviceId)
            return (
              <div key={a.id} draggable onDragStart={() => setArrasta({ tipo: 'consulta', id: a.id })} onClick={() => setVer(a)}
                className="absolute left-1 right-1 z-[5] rounded-xl px-2 py-1 text-[11px] leading-tight text-white overflow-hidden cursor-grab shadow-sm"
                style={{ top: ((hm(a.hora) - inicio) / 30) * ALTURA + 1, height: Math.max((dur / 30) * ALTURA - 3, 26), background: STATUS[a.status].cor }}>
                <b>{a.hora} {c?.nome}</b> · {s.services.find(x => x.id === a.serviceId)?.nome}
                {a.confirmacao && <span className="ml-1 rounded bg-white/25 px-1">{a.confirmacao === 'confirmou' ? '✓ confirmou' : '↻ pediu para remarcar'}</span>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl bg-white border border-line p-1">
        {([['agenda', 'Agenda'], ['manut', 'Manutenções do aparelho']] as const).map(([id, n]) => (
          <button key={id} onClick={() => setAba(id)} className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${aba === id ? 'bg-gold-soft text-ink' : 'text-muted'}`}>{n}</button>
        ))}
      </div>

      {aba === 'manut' ? <Manutencoes /> : (
        <div className="md:grid md:grid-cols-[1fr_260px] gap-4 space-y-4 md:space-y-0">
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 p-3 border-b border-line">
              <button className="btn-ghost px-3" onClick={() => setDia(addDias(dia, -1))}>‹</button>
              <p className="font-serif font-semibold text-xl flex-1 text-center capitalize">{dia === hoje() ? 'Hoje, ' : ''}{fmtDia(dia)}</p>
              <button className="btn-ghost px-3" onClick={() => setDia(addDias(dia, 1))}>›</button>
            </div>
            {s.profs.length > 1 && (
              <div className="flex md:hidden gap-1 p-2 border-b border-line">
                {s.profs.map(p => <button key={p.id} onClick={() => setProfMobile(p.id)} className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${profMobile === p.id ? 'bg-gold-soft' : 'bg-cream'}`}>{p.nome}</button>)}
              </div>
            )}
            {todos.length === 0 && <p className="text-sm text-muted text-center py-3 border-b border-line">A clínica não atende neste dia.</p>}
            <div className="flex max-h-[68dvh] overflow-y-auto">
              <div className="w-12 shrink-0 text-[10px] text-muted text-right pr-1.5"><div className="h-[41px]" />{slots.map(h => <div key={h} style={{ height: ALTURA }}>{h}</div>)}</div>
              {s.profs.map(p => coluna(p.id))}
            </div>
          </div>

          <div className="card p-4 h-fit">
            <h3 className="text-xl">Esperando agendamento</h3>
            <p className="text-xs text-muted mb-3">Arraste para um horário ou toque para agendar.</p>
            {esperando.length === 0 && <p className="text-sm text-muted">Ninguém esperando.</p>}
            {esperando.map(c => (
              <div key={c.id} draggable onDragStart={() => setArrasta({ tipo: 'contato', id: c.id })}
                onClick={() => { const h = primeiroHorarioLivre(s, s.profs[0].id, dia, S.aval); setNovo({ profId: s.profs[0].id, hora: h ?? '08:00', dia, contactId: c.id }) }}
                className="flex items-center gap-2 p-2 rounded-xl bg-rose-50 border border-rose-100 mb-2 cursor-grab">
                <Avatar nome={c.nome} /><div className="min-w-0"><p className="font-semibold text-sm truncate">{c.nome}</p><p className="text-[11px] text-muted truncate">{c.origem}{c.atentar && ` · ⚠️ ${c.atentar}`}</p></div>
              </div>
            ))}
            <div className="mt-4 pt-3 border-t border-line space-y-1 text-[11px] text-muted">
              {(Object.keys(STATUS) as StatusConsulta[]).map(k => <p key={k} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded" style={{ background: STATUS[k].cor }} />{STATUS[k].nome}</p>)}
            </div>
          </div>
        </div>
      )}

      {novo && <NovaConsulta {...novo} problema={problema} fechar={() => setNovo(null)} irPara={setDia} />}
      {ver && (
        <Modal titulo={s.contacts.find(c => c.id === ver.contactId)?.nome ?? ''} fechar={() => setVer(null)}>
          <p className="text-sm text-muted mb-3">{fmtDia(ver.data)} às {ver.hora} · {s.services.find(x => x.id === ver.serviceId)?.nome} · {s.profs.find(p => p.id === ver.profId)?.nome}</p>
          {ver.confirmacao && <p className={`text-sm mb-3 chip ${ver.confirmacao === 'confirmou' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-amber-50 text-amber-900 border-amber-200'}`}>{ver.confirmacao === 'confirmou' ? '✓ Paciente confirmou pelo WhatsApp' : '↻ Paciente pediu para remarcar'}</p>}
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(STATUS) as StatusConsulta[]).map(st => (
              <button key={st} className="btn text-white" style={{ background: STATUS[st].cor, outline: ver.status === st ? '3px solid #D4B26A' : 'none' }}
                onClick={() => {
                  set(x => {
                    let n = { ...x, appts: x.appts.map(a => (a.id === ver.id ? { ...a, status: st } : a)) }
                    if (st === 'realizado' && !x.procs.some(p => p.id === 'pr_' + ver.id))
                      n = { ...n, procs: [...n.procs, { id: 'pr_' + ver.id, contactId: ver.contactId, serviceId: ver.serviceId, data: ver.data, valor: x.services.find(v => v.id === ver.serviceId)?.preco ?? 0 }] }
                    return n
                  })
                  toast(st === 'realizado' ? 'Realizado. Quando passar o prazo de retorno, aparece em Sumidos.' : 'Situação atualizada'); setVer(null)
                }}>{STATUS[st].nome}</button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function Manutencoes() {
  const { s, set, irAgendar } = useApp()
  const disparar = useDisparo()
  const lista = manutencoes(s)
  const grupos: { id: StatusManut; nome: string; cls: string }[] = [
    { id: 'atrasada', nome: 'Atrasadas, sem marcar', cls: 'aviso-agendar' },
    { id: 'faltou', nome: 'Faltaram', cls: 'aviso-agendar' },
    { id: 'a_marcar', nome: 'Vencem nos próximos dias', cls: 'aviso-retorno' },
    { id: 'marcou', nome: 'Já marcaram', cls: 'aviso-manut' },
    { id: 'em_dia', nome: 'Em dia', cls: 'aviso-indicacao' },
  ]
  if (!lista.length) return <Vazio titulo="Nenhum paciente com aparelho.">Marque a etiqueta “Em tratamento (aparelho)” para acompanhar as manutenções.</Vazio>
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {grupos.map(g => {
        const itens = lista.filter(m => m.status === g.id)
        return (
          <div key={g.id} className="card p-4">
            <div className="flex items-center gap-2 mb-3"><h3 className="text-xl flex-1">{g.nome}</h3><span className={`chip ${g.cls}`}>{itens.length}</span></div>
            {itens.length === 0 && <p className="text-sm text-muted">Ninguém aqui.</p>}
            <div className="space-y-2">
              {itens.map(m => (
                <div key={m.contact.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-2.5">
                  <Avatar nome={m.contact.nome} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{m.contact.nome}</p>
                    <p className="text-xs text-muted">
                      {m.status === 'marcou' && m.appt ? `Marcada para ${fmtDia(m.appt.data)} às ${m.appt.hora}`
                        : m.status === 'faltou' && m.appt ? `Faltou em ${fmtDia(m.appt.data)}`
                          : m.status === 'atrasada' ? `Venceu há ${m.dias} dia(s)` : `Vence ${fmtDia(m.vence)}`} · a cada {m.contact.manutencao} dias
                    </p>
                  </div>
                  {(m.status === 'atrasada' || m.status === 'faltou' || m.status === 'a_marcar') && (
                    <div className="flex gap-1.5">
                      <button className="btn-send px-2.5 py-1 text-xs" onClick={() => { const tx = mensagem(s, 'manutencao_atrasada', m.contact); set(st => enviar(st, m.contact.id, tx, 'manut')); disparar(m.contact.fone, tx, m.contact.nome) }}>Enviar</button>
                      <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => irAgendar(m.contact.id, S.man)}>Agendar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function NovaConsulta({ profId, hora, dia, contactId, serviceId, problema, fechar, irPara }: {
  profId: string; hora: string; dia: string; contactId?: string; serviceId?: string
  problema: (p: string, d: string, h: string, sv: string) => string; fechar: () => void; irPara: (d: string) => void
}) {
  const { s, set, toast } = useApp()
  const [f, setF] = useState({ profId, hora, dia, contactId: contactId ?? '', serviceId: serviceId ?? S.aval, obs: '' })
  const erro = f.contactId ? problema(f.profId, f.dia, f.hora, f.serviceId) : ''
  const c = s.contacts.find(x => x.id === f.contactId)
  const sugerir = (mud: Partial<typeof f>) => { const n = { ...f, ...mud }; const h = primeiroHorarioLivre(s, n.profId, n.dia, n.serviceId); setF({ ...n, hora: h ?? n.hora }) }
  return (
    <Modal titulo="Nova consulta" fechar={fechar}>
      <div className="space-y-3">
        <div><label className="label">Paciente</label>
          <select className="input" value={f.contactId} onChange={e => setF({ ...f, contactId: e.target.value })}>
            <option value="">Escolha…</option>{[...s.contacts].sort((a, b) => a.nome.localeCompare(b.nome)).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {c?.atentar && <p className="text-xs text-amber-900 mt-1">⚠️ {c.atentar}</p>}</div>
        <div><label className="label">Serviço</label>
          <select className="input" value={f.serviceId} onChange={e => sugerir({ serviceId: e.target.value })}>
            {s.services.map(x => <option key={x.id} value={x.id}>{x.nome} ({x.duracao} min)</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Dia</label><input className="input" type="date" value={f.dia} onChange={e => sugerir({ dia: e.target.value })} /></div>
          <div><label className="label">Horário</label><input className="input" type="time" step={600} value={f.hora} onChange={e => setF({ ...f, hora: e.target.value })} /></div>
        </div>
        {s.profs.length > 1 && <div><label className="label">Profissional</label>
          <select className="input" value={f.profId} onChange={e => sugerir({ profId: e.target.value })}>{s.profs.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>}
        <div><label className="label">Observação</label><input className="input" value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></div>
        {erro && <p className="text-sm text-red-700 font-medium">⛔ {erro}</p>}
        <button className="btn-gold w-full py-3" disabled={!f.contactId || !!erro} onClick={() => {
          set(st => marcarConsulta(st, { contactId: f.contactId, profId: f.profId, serviceId: f.serviceId, data: f.dia, hora: f.hora, obs: f.obs }))
          irPara(f.dia); toast(`Consulta marcada para ${fmtDia(f.dia)} às ${f.hora}`); fechar()
        }}>Marcar consulta</button>
      </div>
    </Modal>
  )
}

// ---------- 5. Sumidos ----------
export function Sumidos() {
  const { s, set } = useApp()
  const disparar = useDisparo()
  const lista = sumidos(s).filter(x => !s.envios.some(e => e.contactId === x.contact.id && e.dia === hoje()))
  if (!lista.length) return <Vazio titulo="Ninguém sumido agora.">Quem passar do prazo de retorno aparece aqui sozinho.</Vazio>
  return (
    <div className="space-y-3">
      {lista.map(x => {
        const texto = mensagem(s, 'sumido', x.contact, { procedimento: x.service.nome.toLowerCase() })
        return (
          <div key={x.contact.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1"><Avatar nome={x.contact.nome} />
              <div className="space-y-1"><p className="font-semibold">{x.contact.nome}</p><Aviso tipo="sumida">Há {x.dias} dias sem voltar · {x.service.nome} em {fmtDia(x.proc.data)}</Aviso></div></div>
            <div className="flex gap-2 justify-end">
              <BotaoAgendar contactId={x.contact.id} serviceId={x.service.id} />
              <button className="btn-send" onClick={() => { set(st => enviar(st, x.contact.id, texto, 'sumida')); disparar(x.contact.fone, texto, x.contact.nome) }}>Enviar ➤</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------- 6. Resumo ----------
export function Resumo() {
  const { s } = useApp()
  const d = hoje(), desde = addDias(d, -30)
  const soma = (f: (q: Quote) => number) => s.quotes.reduce((t, q) => t + f(q), 0)
  const fechado = soma(q => (q.coluna === 'fechou' || q.coluna === 'fechou_parcial' ? valorFechado(q) : 0))
  const duvida = soma(q => (q.coluna === 'em_duvida' ? q.total : 0))
  const recusou = soma(q => (q.coluna === 'recusou' ? q.total : 0))
  const recuperado = soma(q => (q.recuperado ? valorFechado(q) : 0))
  const chamadas = new Set(s.envios.filter(e => e.motivo !== 'respondeu' && e.motivo !== 'confirmacao').map(e => e.contactId)).size
  const responderam = new Set(s.envios.filter(e => e.motivo === 'respondeu').map(e => e.contactId)).size
  const fecharam = s.quotes.filter(q => q.recuperado).length
  const parado = valorParado(s)
  const manut = s.appts.filter(a => a.serviceId === S.man && a.data >= desde && a.data <= d)
  const manutFeitas = manut.filter(a => a.status === 'realizado').length, manutFaltas = manut.filter(a => a.status === 'faltou').length
  const comparec = manutFeitas + manutFaltas ? Math.round((manutFeitas / (manutFeitas + manutFaltas)) * 100) : 0
  const fechou = (cid: string) => s.quotes.some(q => q.contactId === cid && (q.coluna === 'fechou' || q.coluna === 'fechou_parcial')) || s.procs.some(p => p.contactId === cid)

  const Box = ({ t, v, cor }: { t: string; v: string; cor: string }) => (
    <div className="card p-4"><p className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t}</p><p className="font-serif font-semibold text-3xl" style={{ color: cor }}>{v}</p></div>
  )
  return (
    <div className="space-y-4">
      <div className="hidden print:flex items-center gap-3 mb-4"><img src="/ortoclin-logo.png" className="h-12" alt="" /><p className="ml-auto text-sm">Relatório do dia 30 · {fmtDia(d)}</p></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Box t="A receber (fechado)" v={brl(fechado)} cor="#3E7D3A" />
        <Box t="Em dúvida" v={brl(duvida)} cor="#B9761C" />
        <Box t="Recusou" v={brl(recusou)} cor="#B5544B" />
        <Box t="Recuperado" v={brl(recuperado)} cor="#B8913F" />
      </div>

      <div className="card p-5">
        <h3 className="text-2xl mb-4">Antes e agora</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-cream border border-line p-4"><p className="text-muted font-medium">Parado no dia 7</p><p className="font-serif font-semibold text-3xl">{brl(s.dia7.parado)}</p><p className="text-muted">{s.dia7.emDuvida} em dúvida</p></div>
          <div className="rounded-2xl bg-gold-soft/60 border border-gold-2/50 p-4"><p className="text-[#6b531c] font-medium">Parado hoje</p><p className="font-serif font-semibold text-3xl text-gold">{brl(parado)}</p><p className="text-muted">{s.quotes.filter(q => q.coluna === 'em_duvida').length} em dúvida</p></div>
        </div>
        {s.dia7.parado > parado && <p className="mt-3 text-sm text-green-800 font-medium">O dinheiro parado caiu {brl(s.dia7.parado - parado)} desde o dia 7.</p>}
        <div className="grid grid-cols-3 gap-3 mt-4 text-center">
          {([['Pessoas chamadas', chamadas], ['Responderam', responderam], ['Fecharam depois do contato', fecharam]] as const).map(([t, v]) => (
            <div key={t} className="rounded-2xl border border-line p-3"><p className="font-serif font-semibold text-3xl">{v}</p><p className="text-xs text-muted">{t}</p></div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-2xl">Manutenções do aparelho</h3>
          <p className="text-xs text-muted mb-3">Últimos 30 dias</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl border border-line p-3"><p className="font-serif font-semibold text-3xl">{manutFeitas}</p><p className="text-xs text-muted">Feitas</p></div>
            <div className="rounded-2xl border border-line p-3"><p className="font-serif font-semibold text-3xl">{manutFaltas}</p><p className="text-xs text-muted">Faltas</p></div>
            <div className="rounded-2xl border border-line p-3"><p className="font-serif font-semibold text-3xl">{comparec}%</p><p className="text-xs text-muted">Comparecimento</p></div>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="text-2xl mb-3">De onde vieram os pacientes</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted text-xs"><th className="font-medium pb-2">Origem</th><th className="font-medium pb-2 text-right">Pacientes</th><th className="font-medium pb-2 text-right">Fecharam</th></tr></thead>
            <tbody>
              {ORIGENS.map(o => {
                const cs = s.contacts.filter(c => c.origem === o && c.tagId !== T.nao)
                return <tr key={o} className="border-t border-line"><td className="py-2">{o}</td><td className="py-2 text-right font-semibold">{cs.length}</td><td className="py-2 text-right font-semibold text-green-800">{cs.filter(c => fechou(c.id)).length}</td></tr>
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-2xl mb-2">Consultas por profissional</h3>
        <p className="text-xs text-muted mb-2">Últimos 30 dias</p>
        {s.profs.map(p => {
          const a = s.appts.filter(x => x.profId === p.id && x.data >= desde && x.data <= d)
          return <p key={p.id} className="text-sm py-1">{p.nome}: <b>{a.filter(x => x.status === 'realizado').length}</b> realizadas · <b>{a.filter(x => x.status === 'faltou').length}</b> faltas</p>
        })}
      </div>
      <button className="btn-gold no-print" onClick={() => window.print()}>⬇️ Baixar relatório do dia 30 (PDF)</button>
    </div>
  )
}

// ---------- 8. Ajustes ----------
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export function Ajustes() {
  const { s, set, reset, toast } = useApp()
  const [aba, setAba] = useState('clinica')
  const up = <K extends keyof State>(k: K, v: State[K]) => set(st => ({ ...st, [k]: v }))
  const abas = [['clinica', 'Clínica'], ['servicos', 'Serviços'], ['etiquetas', 'Etiquetas'], ['agenda', 'Agenda'], ['mensagens', 'Mensagens'], ['whats', 'WhatsApp']]
  const exemplo = s.appts.find(a => a.data > hoje() && a.status !== 'cancelado')
  const exC = s.contacts.find(c => c.id === exemplo?.contactId) ?? s.contacts[0]
  const previa = mensagem(s, 'confirmacao_consulta', exC, { data: exemplo ? fmtDia(exemplo.data) : 'ter., 24/11', hora: exemplo?.hora ?? '09:00' })

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {abas.map(([id, n]) => <button key={id} onClick={() => setAba(id)} className={`rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap border ${aba === id ? 'bg-ink text-white border-ink' : 'bg-white border-line text-muted'}`}>{n}</button>)}
      </div>

      {aba === 'clinica' && <div className="card p-5 space-y-3 max-w-lg">
        <div><label className="label">Nome da clínica</label><input className="input" value={s.clinica.nome} onChange={e => up('clinica', { ...s.clinica, nome: e.target.value })} /></div>
        <div><label className="label">Subtítulo</label><input className="input" value={s.clinica.subtitulo} onChange={e => up('clinica', { ...s.clinica, subtitulo: e.target.value })} /></div>
        <div><label className="label">Endereço</label><input className="input" value={s.clinica.endereco} onChange={e => up('clinica', { ...s.clinica, endereco: e.target.value })} /></div>
        <div><label className="label">Esfria depois de quantos dias sem contato</label><input className="input" inputMode="numeric" value={s.clinica.prazoEsfriar} onChange={e => up('clinica', { ...s.clinica, prazoEsfriar: Number(e.target.value) || 1 })} /></div>
        {DEMO && <button className="btn-ghost text-red-700" onClick={() => { if (confirm('Voltar aos dados de exemplo?')) { reset(); toast('Demonstração reiniciada') } }}>Reiniciar demonstração</button>}
      </div>}

      {aba === 'servicos' && <div className="card divide-y divide-line">
        {s.services.map((x, i) => (
          <div key={x.id} className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
            <div className="col-span-2 md:col-span-1"><label className="label">Serviço</label><input className="input" value={x.nome} onChange={e => up('services', s.services.map((y, j) => (j === i ? { ...y, nome: e.target.value } : y)))} /></div>
            <div><label className="label">Preço médio (R$)</label><input className="input" inputMode="numeric" placeholder="A preencher" value={x.preco || ''} onChange={e => up('services', s.services.map((y, j) => (j === i ? { ...y, preco: Number(e.target.value) || 0 } : y)))} /></div>
            <div><label className="label">Duração (min)</label><input className="input" inputMode="numeric" value={x.duracao} onChange={e => up('services', s.services.map((y, j) => (j === i ? { ...y, duracao: Number(e.target.value) || 30 } : y)))} /></div>
            <div className="col-span-2 md:col-span-1"><label className="label">Retorno em (dias)</label><input className="input" inputMode="numeric" placeholder="Sem retorno" value={x.retorno || ''} onChange={e => up('services', s.services.map((y, j) => (j === i ? { ...y, retorno: Number(e.target.value) || 0 } : y)))} /></div>
          </div>
        ))}
        <div className="p-4"><button className="btn-ghost" onClick={() => up('services', [...s.services, { id: uid(), nome: 'Novo serviço', preco: 0, duracao: 30, retorno: 0 }])}>+ Adicionar serviço</button></div>
      </div>}

      {aba === 'etiquetas' && <div className="card divide-y divide-line">
        {s.tags.map((t, i) => (
          <div key={t.id} className="p-4 flex flex-wrap items-center gap-2">
            <input type="color" value={t.cor} className="w-10 h-10 rounded-lg border border-line" onChange={e => up('tags', s.tags.map((y, j) => (j === i ? { ...y, cor: e.target.value } : y)))} />
            <input className="input flex-1 min-w-40" value={t.nome} onChange={e => up('tags', s.tags.map((y, j) => (j === i ? { ...y, nome: e.target.value } : y)))} />
            <label className="text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"><input type="checkbox" className="accent-[#B8913F]" checked={t.painel} onChange={e => up('tags', s.tags.map((y, j) => (j === i ? { ...y, painel: e.target.checked } : y)))} /> Vai para o Painel</label>
          </div>
        ))}
        <div className="p-4"><button className="btn-ghost" onClick={() => up('tags', [...s.tags, { id: uid(), nome: 'Nova etiqueta', cor: '#8A6A24', painel: false }])}>+ Nova etiqueta</button></div>
      </div>}

      {aba === 'agenda' && <div className="space-y-4">
        <div className="card p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex-1"><h3 className="text-xl">Confirmação de consulta na véspera</h3>
              <p className="text-sm text-muted">Às {s.clinica.horaConfirmacao} do dia anterior, envia a mensagem abaixo para quem tem consulta. Quem confirmar ou pedir para remarcar aparece marcado na Agenda.</p></div>
            <button role="switch" aria-checked={s.clinica.confirmacaoVespera} aria-label="Ligar confirmação na véspera" onClick={() => up('clinica', { ...s.clinica, confirmacaoVespera: !s.clinica.confirmacaoVespera })}
              className={`w-12 h-7 rounded-full p-1 transition shrink-0 ${s.clinica.confirmacaoVespera ? 'bg-wa' : 'bg-line'}`}>
              <span className={`block w-5 h-5 rounded-full bg-white shadow transition ${s.clinica.confirmacaoVespera ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          <div className="grid sm:grid-cols-[140px_1fr] gap-3 items-start">
            <div><label className="label">Horário do envio</label><input className="input" type="time" value={s.clinica.horaConfirmacao} onChange={e => up('clinica', { ...s.clinica, horaConfirmacao: e.target.value })} /></div>
            <div><label className="label">Prévia</label><div className="rounded-2xl bg-[#efeae2] p-3"><div className="ml-auto max-w-[90%] rounded-2xl bg-[#d9fdd3] px-3 py-2 text-sm shadow-sm">{previa}</div></div></div>
          </div>
          <p className="text-xs text-muted">{s.clinica.confirmacaoVespera ? 'Ligada.' : 'Desligada.'} Segue as regras de proteção do número (intervalo entre envios e horário de 8h às 20h).</p>
        </div>

        {s.profs.map((p, i) => (
          <div key={p.id} className="card p-5 space-y-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1"><label className="label">Profissional</label><input className="input" value={p.nome} onChange={e => up('profs', s.profs.map((y, j) => (j === i ? { ...y, nome: e.target.value } : y)))} /></div>
              <input type="color" value={p.cor} className="w-10 h-10 rounded-lg border border-line" onChange={e => up('profs', s.profs.map((y, j) => (j === i ? { ...y, cor: e.target.value } : y)))} />
            </div>
            <p className="label">Horário de atendimento (ex.: 08:00-12:00, 14:00-19:00; vazio = não atende)</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {[1, 2, 3, 4, 5, 6, 0].map(dw => (
                <div key={dw} className="flex items-center gap-2">
                  <span className="w-20 text-sm text-muted">{DIAS[dw]}</span>
                  <input className="input" placeholder="Não atende" value={p.horario[dw] ?? ''} onChange={e => up('profs', s.profs.map((y, j) => (j === i ? { ...y, horario: { ...y.horario, [dw]: e.target.value } } : y)))} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <button className="btn-ghost" onClick={() => up('profs', [...s.profs, { id: uid(), nome: 'Novo profissional', cor: '#2F7F72', horario: { ...s.profs[0]?.horario } }])}>+ Adicionar profissional</button>
      </div>}

      {aba === 'mensagens' && <div className="card divide-y divide-line">
        <p className="p-4 text-xs text-muted">Use {'{nome}'}, {'{procedimento}'}, {'{etapa}'}, {'{valor}'}, {'{data}'}, {'{hora}'} e {'{profissional}'}. Eles são trocados sozinhos.</p>
        {Object.entries(s.templates).map(([k, v]) => (
          <div key={k} className="p-4"><label className="label capitalize">{k.replace(/_/g, ' ').replace('ideia ', 'Ideia · ')}</label>
            <textarea className="input min-h-16" value={v} onChange={e => up('templates', { ...s.templates, [k]: e.target.value })} /></div>
        ))}
      </div>}

      {aba === 'whats' && <WhatsAppAjustes />}
    </div>
  )
}

function WhatsAppAjustes() {
  const { st } = useStatusWpp(5000)
  const { s, set } = useApp()
  const reais = usarConversasReais(s.clinica.conversasReais)
  return (
    <div className="card p-5 space-y-4 max-w-md">
      <h3 className="text-xl">WhatsApp da clínica</h3>
      <ConectarWhatsApp />
      <label className="flex items-start gap-3 rounded-2xl border border-line p-3 cursor-pointer">
        <input type="checkbox" className="mt-1 accent-[#B8913F]" checked={reais} onChange={e => set(x => ({ ...x, clinica: { ...x.clinica, conversasReais: e.target.checked } }))} />
        <span className="text-sm"><b>Mostrar as conversas reais do WhatsApp no painel</b><br /><span className="text-muted">Com o painel aberto, o site busca as mensagens novas a cada minuto (ou na hora, em “Atualizar agora”). Quem responder sai de “Chamar hoje”, e quem escrever “Vim pelo site” entra com origem Site.</span></span>
      </label>
      {st?.estado === 'open' && <><TesteEnvio /><Desconectar /></>}
      <p className="text-xs text-muted">Proteção do número: até 40 mensagens por dia, intervalo de 20 a 60 segundos entre envios, só das 8h às 20h e nada de envio em massa.</p>
    </div>
  )
}
