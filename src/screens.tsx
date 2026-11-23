import { useMemo, useState, type ReactNode } from 'react'
import { useApp } from './store'
import { ConectarWhatsApp, Desconectar, useStatusWpp } from './whatsapp'
import {
  COLUNAS, addDias, brl, chamarHoje, diasDesde, esfriou, fmtDia, hhmm, hm, hoje, mensagem, sumidos, uid, valorParado,
  type Appt, type Coluna, type Quote, type State, type StatusConsulta,
} from './data'

// ---------- ações compartilhadas ----------
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
    ? [...s.quotes, { id: uid(), contactId, serviceId: s.services[0].id, coluna: 'para_organizar' as Coluna, total: 0, fechado: 0, atentar: '', dataOrc: hoje(), ultimoContato: hoje(), tentativas: 0 }]
    : s.quotes
  return { ...s, quotes, contacts: s.contacts.map(c => (c.id === contactId ? { ...c, tagId, novo: false } : c)) }
}

const Vazio = ({ children }: { children: ReactNode }) => (
  <div className="card p-8 text-center text-black/60 flex flex-col items-center gap-3">
    <img src="/mascote.webp" alt="" className="w-24 rounded-2xl" />{children}
  </div>
)

function Modal({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end md:items-center justify-center" onClick={fechar}>
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl p-5 max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center mb-4"><h2 className="font-extrabold text-lg flex-1">{titulo}</h2><button onClick={fechar} className="text-2xl leading-none text-black/40">×</button></div>
        {children}
      </div>
    </div>
  )
}

const Etiqueta = ({ s, tagId }: { s: State; tagId: string | null }) => {
  const t = s.tags.find(x => x.id === tagId)
  return t
    ? <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white whitespace-nowrap" style={{ background: t.cor }}>{t.nome}</span>
    : <span className="rounded-full px-2 py-0.5 text-[11px] font-bold bg-green-100 text-green-700">Novo · etiquetar</span>
}

const Avatar = ({ nome }: { nome: string }) => (
  <div className="w-10 h-10 shrink-0 rounded-full bg-cream text-ink font-extrabold flex items-center justify-center">{nome.split(' ').map(p => p[0]).slice(0, 2).join('')}</div>
)

// ---------- 1. Chamar hoje ----------
export function ChamarHoje() {
  const { s, set, toast } = useApp()
  const itens = chamarHoje(s)
  const [edit, setEdit] = useState<Record<string, string>>({})
  const total = itens.reduce((t, i) => t + i.valor, 0)
  if (!itens.length) return <Vazio><p className="font-bold text-lg text-ink">Tudo em dia por hoje.</p><p>Amanhã cedo aparece quem precisa ser chamado.</p></Vazio>
  return (
    <div className="space-y-3">
      <p className="text-sm text-black/60"><b className="text-ink">{itens.length} pessoas</b> para chamar hoje · {brl(total)} em jogo. Leva uns 15 minutos.</p>
      {itens.map(i => {
        const k = i.contact.id + i.tipo
        const texto = edit[k] ?? i.texto
        return (
          <div key={k} className="card p-4 border-l-4" style={{ borderLeftColor: i.cor }}>
            <div className="flex items-start gap-3">
              <Avatar nome={i.contact.nome} />
              <div className="flex-1 min-w-0">
                <p className="font-bold">{i.contact.nome}</p>
                <p className="text-sm font-semibold" style={{ color: i.cor }}>{i.motivo}</p>
                {i.contact.atentar && <p className="text-xs mt-1 bg-amber-50 text-amber-800 rounded-lg px-2 py-1 inline-block">⚠️ {i.contact.atentar}</p>}
              </div>
              {i.valor > 0 && <p className="font-extrabold">{brl(i.valor)}</p>}
            </div>
            <textarea className="input mt-3 min-h-20" value={texto} onChange={e => setEdit({ ...edit, [k]: e.target.value })} />
            <div className="flex justify-end mt-2">
              <button className="btn-send px-6" onClick={() => { set(st => enviar(st, i.contact.id, texto, i.tipo, i.quoteId)); toast(`Mensagem para ${i.contact.nome.split(' ')[0]} na fila do WhatsApp`) }}>Enviar ➤</button>
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
  const [aberto, setAberto] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [lado, setLado] = useState(false)

  const lista = useMemo(() => s.contacts
    .map(c => ({ c, ult: s.msgs.filter(m => m.contactId === c.id).sort((a, b) => b.ts - a.ts)[0] }))
    .filter(({ c }) => c.nome.toLowerCase().includes(busca.toLowerCase()) && (!filtro || (filtro === 'novo' ? !c.tagId : c.tagId === filtro)))
    .sort((a, b) => (b.ult?.ts ?? 0) - (a.ult?.ts ?? 0)), [s, busca, filtro])

  const c = s.contacts.find(x => x.id === aberto)
  const msgs = s.msgs.filter(m => m.contactId === aberto).sort((a, b) => a.ts - b.ts)
  const card = s.quotes.find(q => q.contactId === aberto && q.coluna !== 'recusou')
  const consulta = s.appts.filter(a => a.contactId === aberto && a.data >= hoje()).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))[0]
  const hora = (ts: number) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const mandar = () => { if (!texto.trim() || !c) return; set(st => ({ ...st, msgs: [...st.msgs, { id: uid(), contactId: c.id, dir: 'out', texto, ts: Date.now() }] })); setTexto('') }
  // Na versão real, a mensagem chega pela Evolution API. Aqui simulamos a resposta da paciente.
  const simularResposta = () => c && set(st => ({
    ...st,
    msgs: [...st.msgs, { id: uid(), contactId: c.id, dir: 'in', texto: 'Oi! Vi sua mensagem, quero sim 😊', ts: Date.now() }],
    envios: [...st.envios, { contactId: c.id, dia: hoje(), motivo: 'respondeu' }],
    quotes: st.quotes.map(q => (q.contactId === c.id ? { ...q, ultimoContato: hoje() } : q)),
  }))

  const menuEtiqueta = (cid: string) => menu === cid && (
    <div className="absolute z-30 right-0 top-7 bg-white card p-1 w-56 shadow-xl" onClick={e => e.stopPropagation()}>
      {s.tags.map(t => (
        <button key={t.id} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black/5 text-sm text-left"
          onClick={() => { set(st => aplicarEtiqueta(st, cid, t.id)); setMenu(null); if (t.painel) toast(`Foi para o Painel em "Para organizar"`) }}>
          <span className="w-3 h-3 rounded-full" style={{ background: t.cor }} />{t.nome}{t.painel && <span className="ml-auto text-[10px] text-black/40">→ Painel</span>}
        </button>
      ))}
    </div>
  )

  return (
    <div className="card overflow-hidden md:grid md:grid-cols-[320px_1fr] h-[calc(100dvh-170px)] md:h-[calc(100dvh-110px)]" onClick={() => setMenu(null)}>
      {/* lista */}
      <div className={`${aberto ? 'hidden md:flex' : 'flex'} flex-col border-r border-black/5 min-h-0 h-full`}>
        <div className="p-3 space-y-2 border-b border-black/5">
          <input className="input" placeholder="Buscar conversa" value={busca} onChange={e => setBusca(e.target.value)} />
          <div className="flex gap-1 overflow-x-auto text-xs">
            {[{ id: '', nome: 'Todas' }, { id: 'novo', nome: 'Novos' }, ...s.tags].map(t => (
              <button key={t.id} onClick={() => setFiltro(t.id)} className={`rounded-full px-3 py-1 whitespace-nowrap font-semibold ${filtro === t.id ? 'bg-ink text-cream' : 'bg-black/5'}`}>{t.nome}</button>
            ))}
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {lista.map(({ c, ult }) => (
            <div key={c.id} onClick={() => setAberto(c.id)} className={`flex gap-3 px-3 py-3 border-b border-black/5 cursor-pointer hover:bg-black/[.02] ${aberto === c.id ? 'bg-cream/50' : ''}`}>
              <Avatar nome={c.nome} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold truncate flex-1">{c.nome}</p>
                  <span className="text-[11px] text-black/40">{ult && hora(ult.ts)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-black/50 truncate flex-1">{ult?.dir === 'out' && '✓✓ '}{ult?.texto}</p>
                  <div className="relative" onClick={e => { e.stopPropagation(); setMenu(menu === c.id ? null : c.id) }}>
                    <button><Etiqueta s={s} tagId={c.tagId} /></button>
                    {menuEtiqueta(c.id)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* conversa */}
      {c ? (
        <div className="flex flex-col min-h-0 h-full">
          <div className="flex items-center gap-3 p-3 border-b border-black/5">
            <button className="md:hidden text-xl" onClick={() => setAberto(null)}>←</button>
            <Avatar nome={c.nome} />
            <div className="flex-1 min-w-0"><p className="font-bold truncate">{c.nome}</p><p className="text-xs text-black/50">{c.fone}</p></div>
            <button className="btn-ghost text-xs" onClick={() => setLado(!lado)}>{lado ? 'Conversa' : 'Resumo'}</button>
          </div>
          {lado ? (
            <div className="p-4 space-y-3 overflow-y-auto text-sm">
              <div><p className="label">Etiqueta</p><div className="relative inline-block" onClick={e => { e.stopPropagation(); setMenu(menu === c.id ? null : c.id) }}><button><Etiqueta s={s} tagId={c.tagId} /></button>{menuEtiqueta(c.id)}</div></div>
              <div><p className="label">No painel</p>{card ? <p>{COLUNAS.find(x => x.id === card.coluna)?.nome} · {s.services.find(x => x.id === card.serviceId)?.nome} · <b>{brl(card.total)}</b></p> : <p className="text-black/40">Sem card</p>}</div>
              <div><p className="label">Algo a se atentar</p>
                <input className="input" value={c.atentar} placeholder="Ex.: tem medo de agulha" onChange={e => set(st => ({ ...st, contacts: st.contacts.map(x => (x.id === c.id ? { ...x, atentar: e.target.value } : x)) }))} /></div>
              <div><p className="label">Próxima consulta</p>{consulta ? <p>{fmtDia(consulta.data)} às {consulta.hora} · {s.profs.find(p => p.id === consulta.profId)?.nome}</p> : <p className="text-black/40">Nenhuma</p>}</div>
              <button className="btn-dark w-full" onClick={() => { set(st => aplicarEtiqueta(st, c.id, 't2')); toast('Etiqueta "Esperando agendamento". Ela aparece na Agenda.') }}>📅 Agendar</button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#efe7dc]">
                {msgs.map(m => (
                  <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.dir === 'out' ? 'ml-auto bg-[#d9fdd3]' : 'bg-white'}`}>
                    {m.texto}<span className="block text-right text-[10px] text-black/40">{hora(m.ts)}{m.dir === 'out' && ' ✓✓'}</span>
                  </div>
                ))}
              </div>
              <div className="p-2 flex gap-2 border-t border-black/5">
                <input className="input" placeholder="Mensagem" value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && mandar()} />
                <button className="btn-send" onClick={mandar}>➤</button>
              </div>
              <button className="text-[11px] text-black/40 underline pb-2" onClick={simularResposta}>(demo) simular resposta da paciente</button>
            </>
          )}
        </div>
      ) : (
        <div className="hidden md:flex items-center justify-center text-black/40 flex-col gap-2"><img src="/mascote.webp" className="w-28 rounded-2xl" alt="" />Escolha uma conversa</div>
      )}
    </div>
  )
}

// ---------- 3. Painel ----------
export function Painel() {
  const { s, set, toast } = useApp()
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [abrir, setAbrir] = useState<{ q: Quote; coluna: Coluna } | null>(null)

  return (
    <div>
      <p className="text-sm text-black/60 mb-3 hidden md:block">Arraste o card para a coluna certa. No celular, use “Mover para”.</p>
      <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
        {COLUNAS.map(col => {
          const cards = s.quotes.filter(q => q.coluna === col.id)
          const soma = cards.reduce((t, q) => t + (col.id === 'fechou_parcial' ? q.total - q.fechado : col.id === 'fechou' ? q.fechado : q.total), 0)
          return (
            <div key={col.id} className="snap-start shrink-0 w-[82vw] sm:w-72 bg-black/[.04] rounded-2xl p-2 min-h-60"
              onDragOver={e => e.preventDefault()}
              onDrop={() => { const q = s.quotes.find(x => x.id === arrastando); if (q && q.coluna !== col.id) setAbrir({ q, coluna: col.id }); setArrastando(null) }}>
              <div className="flex items-center gap-2 px-2 py-1 mb-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: col.cor }} />
                <p className="font-extrabold text-sm flex-1">{col.nome} <span className="text-black/40">{cards.length}</span></p>
                {soma > 0 && <p className="text-xs font-bold text-black/50">{col.id === 'fechou_parcial' ? 'falta ' : ''}{brl(soma)}</p>}
              </div>
              <div className="space-y-2">
                {cards.map(q => {
                  const c = s.contacts.find(x => x.id === q.contactId)!
                  const frio = esfriou(s, q)
                  return (
                    <div key={q.id} draggable onDragStart={() => setArrastando(q.id)} onClick={() => setAbrir({ q, coluna: q.coluna })}
                      className={`rounded-2xl border shadow-sm p-3 cursor-grab active:cursor-grabbing ${frio ? 'bg-blue-50 border-blue-300' : 'bg-white border-black/5'}`}>
                      <div className="flex items-start gap-2">
                        <p className="font-bold flex-1">{c.nome}</p>
                        {q.total > 0 && <p className="font-extrabold text-sm">{brl(q.total)}</p>}
                      </div>
                      <p className="text-xs text-black/50">{s.services.find(x => x.id === q.serviceId)?.nome}{q.coluna === 'fechou_parcial' && ` · fechou ${brl(q.fechado)}`}</p>
                      {frio && <p className="text-xs font-bold text-blue-700 mt-1">❄️ esfriou · {diasDesde(q.ultimoContato)} dias sem contato</p>}
                      {(q.atentar || c.atentar) && <p className="text-xs mt-1 text-amber-800">⚠️ {q.atentar || c.atentar}</p>}
                      <select className="mt-2 text-xs bg-black/5 rounded-lg px-2 py-1 w-full" value="" onClick={e => e.stopPropagation()}
                        onChange={e => setAbrir({ q, coluna: e.target.value as Coluna })}>
                        <option value="">Mover para…</option>
                        {COLUNAS.filter(x => x.id !== q.coluna).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                      </select>
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
            const eraDuvida = st.quotes.find(x => x.id === q.id)?.coluna === 'em_duvida'
            const recuperado = eraDuvida && ['fechou', 'fechou_parcial'].includes(q.coluna) && (q.tentativas > 0)
            let n = { ...st, quotes: st.quotes.map(x => (x.id === q.id ? { ...q, recuperado: x.recuperado || recuperado } : x)) }
            if (msg) n = enviar(n, q.contactId, msg, 'painel_' + q.coluna, q.id)
            return n
          })
          toast(msg ? 'Salvo e mensagem na fila do WhatsApp' : 'Card atualizado'); setAbrir(null)
        }} />}
    </div>
  )
}

function CardModal({ q, coluna, fechar, salvar }: { q: Quote; coluna: Coluna; fechar: () => void; salvar: (q: Quote, msg?: string) => void }) {
  const { s } = useApp()
  const c = s.contacts.find(x => x.id === q.contactId)!
  const [f, setF] = useState({ ...q, coluna, atentar: q.atentar || c.atentar, fechado: coluna === 'fechou' ? q.total : q.fechado })
  const sv = s.services.find(x => x.id === f.serviceId)
  const ideia = mensagem(s, 'ideia_' + f.coluna, c, { procedimento: sv?.nome ?? '', valor: brl(f.total) })
  const [msg, setMsg] = useState<string | null>(null)
  const texto = msg ?? ideia
  const num = (v: string) => Number(v.replace(/\D/g, '')) || 0

  return (
    <Modal titulo={`${c.nome} → ${COLUNAS.find(x => x.id === coluna)?.nome}`} fechar={fechar}>
      <div className="space-y-3">
        <div><label className="label">Procedimento</label>
          <select className="input" value={f.serviceId} onChange={e => { const n = s.services.find(x => x.id === e.target.value)!; setF({ ...f, serviceId: n.id, total: f.total || n.preco }) }}>
            {s.services.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-2">
          <div className={f.coluna === 'fechou_parcial' ? '' : 'col-span-2'}><label className="label">{f.coluna === 'fechou_parcial' ? 'Valor do plano' : 'Valor'}</label>
            <input className="input" inputMode="numeric" value={f.total ? brl(f.total) : ''} placeholder={sv ? brl(sv.preco) : 'R$'} onChange={e => setF({ ...f, total: num(e.target.value) })} /></div>
          {f.coluna === 'fechou_parcial' && <div><label className="label">Quanto fechou</label>
            <input className="input" inputMode="numeric" value={f.fechado ? brl(f.fechado) : ''} onChange={e => setF({ ...f, fechado: num(e.target.value) })} /></div>}
        </div>
        {f.coluna === 'fechou_parcial' && f.total > f.fechado && <p className="text-xs text-teal-700 font-semibold">{brl(f.total - f.fechado)} continuam parados até ela fechar o resto.</p>}
        <div><label className="label">Algo a se atentar</label>
          <input className="input" placeholder="Ex.: tem medo de agulha, só pode à tarde" value={f.atentar} onChange={e => setF({ ...f, atentar: e.target.value })} /></div>
        <div className="rounded-2xl bg-cream/60 p-3">
          <p className="label">💡 Ideia do que enviar</p>
          <textarea className="input min-h-24 bg-white" value={texto} onChange={e => setMsg(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={() => salvar({ ...f, fechado: f.coluna === 'fechou' ? f.total : f.fechado })}>Agora não</button>
          <button className="btn-send flex-1" onClick={() => salvar({ ...f, fechado: f.coluna === 'fechou' ? f.total : f.fechado }, texto)}>Enviar agora ➤</button>
        </div>
      </div>
    </Modal>
  )
}

// ---------- 4. Agenda ----------
const STATUS: Record<StatusConsulta, string> = { marcado: '#6b7280', confirmado: '#2563eb', realizado: '#16a34a', faltou: '#dc2626', cancelado: '#a3a3a3' }

export function Agenda() {
  const { s, set, toast } = useApp()
  const [dia, setDia] = useState(hoje())
  const [profMobile, setProfMobile] = useState(s.profs[0].id)
  const [novo, setNovo] = useState<{ profId: string; hora: string; contactId?: string } | null>(null)
  const [ver, setVer] = useState<Appt | null>(null)
  const [arrasta, setArrasta] = useState<{ tipo: 'contato' | 'consulta'; id: string } | null>(null)
  const slots = Array.from({ length: 24 }, (_, i) => hhmm(8 * 60 + i * 30))
  const esperando = s.contacts.filter(c => c.tagId === 't2' && !s.appts.some(a => a.contactId === c.id && a.data >= hoje() && a.status !== 'cancelado'))
  const dur = (a: Appt) => s.services.find(x => x.id === a.serviceId)?.duracao ?? 30

  function problema(profId: string, hora: string, serviceId: string, ignorar?: string) {
    const p = s.profs.find(x => x.id === profId)!
    const ini = hm(hora), fim = ini + (s.services.find(x => x.id === serviceId)?.duracao ?? 30)
    if (ini < hm(p.inicio) || fim > hm(p.fim)) return `Fora do expediente de ${p.nome} (${p.inicio} às ${p.fim})`
    const choque = s.appts.find(a => a.id !== ignorar && a.profId === profId && a.data === dia && a.status !== 'cancelado' && hm(a.hora) < fim && hm(a.hora) + dur(a) > ini)
    return choque ? `${p.nome} já tem ${s.contacts.find(c => c.id === choque.contactId)?.nome} às ${choque.hora}` : ''
  }

  function soltar(profId: string, hora: string) {
    if (!arrasta) return
    if (arrasta.tipo === 'contato') setNovo({ profId, hora, contactId: arrasta.id })
    else {
      const a = s.appts.find(x => x.id === arrasta.id)!
      const erro = problema(profId, hora, a.serviceId, a.id)
      if (erro) toast('⛔ ' + erro)
      else { set(st => ({ ...st, appts: st.appts.map(x => (x.id === a.id ? { ...x, profId, hora, data: dia } : x)) })); toast('Consulta remarcada') }
    }
    setArrasta(null)
  }

  const coluna = (profId: string) => {
    const p = s.profs.find(x => x.id === profId)!
    return (
      <div key={profId} className={`flex-1 min-w-0 ${profId !== profMobile ? 'hidden md:block' : ''}`}>
        <p className="text-center font-bold text-sm py-2 sticky top-0 bg-white border-b border-black/5" style={{ color: p.cor }}>{p.nome}</p>
        {slots.map(h => {
          const fora = hm(h) < hm(p.inicio) || hm(h) >= hm(p.fim)
          const a = s.appts.find(x => x.profId === profId && x.data === dia && x.hora === h && x.status !== 'cancelado')
          const ocupado = s.appts.some(x => x.profId === profId && x.data === dia && x.status !== 'cancelado' && hm(x.hora) < hm(h) && hm(x.hora) + dur(x) > hm(h))
          return (
            <div key={h} className={`h-12 border-b border-black/5 px-1 relative ${fora ? 'bg-black/[.04]' : 'hover:bg-cream/40 cursor-pointer'}`}
              onDragOver={e => e.preventDefault()} onDrop={() => soltar(profId, h)}
              onClick={() => !a && !ocupado && (fora ? toast('Fora do expediente de ' + p.nome) : setNovo({ profId, hora: h }))}>
              {a && (
                <div draggable onDragStart={e => { e.stopPropagation(); setArrasta({ tipo: 'consulta', id: a.id }) }} onClick={e => { e.stopPropagation(); setVer(a) }}
                  className="absolute inset-x-1 top-0.5 z-10 rounded-lg px-2 py-1 text-xs text-white overflow-hidden cursor-grab"
                  style={{ height: (dur(a) / 30) * 48 - 4, background: STATUS[a.status] }}>
                  <b>{a.hora} {s.contacts.find(c => c.id === a.contactId)?.nome}</b><br />{s.services.find(x => x.id === a.serviceId)?.nome} · {a.status}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="md:grid md:grid-cols-[1fr_240px] gap-4 space-y-4 md:space-y-0">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 p-3 border-b border-black/5">
          <button className="btn-ghost" onClick={() => setDia(addDias(dia, -1))}>‹</button>
          <p className="font-bold flex-1 text-center capitalize">{dia === hoje() ? 'Hoje, ' : ''}{fmtDia(dia)}</p>
          <button className="btn-ghost" onClick={() => setDia(addDias(dia, 1))}>›</button>
        </div>
        <div className="flex md:hidden gap-1 p-2 border-b border-black/5">
          {s.profs.map(p => <button key={p.id} onClick={() => setProfMobile(p.id)} className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${profMobile === p.id ? 'bg-ink text-cream' : 'bg-black/5'}`}>{p.nome}</button>)}
        </div>
        <div className="flex max-h-[65dvh] overflow-y-auto">
          <div className="w-12 shrink-0 text-[10px] text-black/40 text-right pr-1"><div className="h-[37px]" />{slots.map(h => <div key={h} className="h-12">{h}</div>)}</div>
          {s.profs.map(p => coluna(p.id))}
        </div>
      </div>

      <div className="card p-3 h-fit">
        <p className="font-extrabold text-sm mb-1">Esperando agendamento</p>
        <p className="text-xs text-black/50 mb-3">Arraste para um horário ou toque para agendar.</p>
        {esperando.length === 0 && <p className="text-sm text-black/40">Ninguém esperando 🎉</p>}
        {esperando.map(c => (
          <div key={c.id} draggable onDragStart={() => setArrasta({ tipo: 'contato', id: c.id })}
            onClick={() => setNovo({ profId: profMobile, hora: s.profs.find(p => p.id === profMobile)!.inicio, contactId: c.id })}
            className="flex items-center gap-2 p-2 rounded-xl bg-pink-50 mb-2 cursor-grab">
            <Avatar nome={c.nome} /><div className="min-w-0"><p className="font-bold text-sm truncate">{c.nome}</p>{c.atentar && <p className="text-[11px] text-amber-800 truncate">⚠️ {c.atentar}</p>}</div>
          </div>
        ))}
      </div>

      {novo && <NovaConsulta {...novo} dia={dia} problema={problema} fechar={() => setNovo(null)} />}
      {ver && (
        <Modal titulo={s.contacts.find(c => c.id === ver.contactId)?.nome ?? ''} fechar={() => setVer(null)}>
          <p className="text-sm mb-3">{fmtDia(ver.data)} às {ver.hora} · {s.services.find(x => x.id === ver.serviceId)?.nome} · {s.profs.find(p => p.id === ver.profId)?.nome}</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(STATUS) as StatusConsulta[]).map(st => (
              <button key={st} className="btn text-white capitalize" style={{ background: STATUS[st], opacity: ver.status === st ? 1 : 0.75 }}
                onClick={() => {
                  set(x => {
                    let n = { ...x, appts: x.appts.map(a => (a.id === ver.id ? { ...a, status: st } : a)) }
                    if (st === 'realizado' && !x.procs.some(p => p.id === 'pr_' + ver.id))
                      n = { ...n, procs: [...n.procs, { id: 'pr_' + ver.id, contactId: ver.contactId, serviceId: ver.serviceId, data: ver.data, valor: x.services.find(v => v.id === ver.serviceId)?.preco ?? 0 }] }
                    return n
                  })
                  toast(st === 'realizado' ? 'Realizado. Ela entra em Sumidos quando passar o prazo de retorno.' : 'Status atualizado'); setVer(null)
                }}>{st}</button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function NovaConsulta({ profId, hora, contactId, dia, problema, fechar }: { profId: string; hora: string; contactId?: string; dia: string; problema: (p: string, h: string, sv: string) => string; fechar: () => void }) {
  const { s, set, toast } = useApp()
  const [f, setF] = useState({ profId, hora, contactId: contactId ?? '', serviceId: s.services[0].id })
  const erro = f.contactId ? problema(f.profId, f.hora, f.serviceId) : ''
  return (
    <Modal titulo="Nova consulta" fechar={fechar}>
      <div className="space-y-3">
        <div><label className="label">Paciente</label>
          <select className="input" value={f.contactId} onChange={e => setF({ ...f, contactId: e.target.value })}>
            <option value="">Escolha…</option>{s.contacts.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select></div>
        <div><label className="label">Serviço</label>
          <select className="input" value={f.serviceId} onChange={e => setF({ ...f, serviceId: e.target.value })}>
            {s.services.map(x => <option key={x.id} value={x.id}>{x.nome} ({x.duracao} min)</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Profissional</label>
            <select className="input" value={f.profId} onChange={e => setF({ ...f, profId: e.target.value })}>{s.profs.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
          <div><label className="label">Horário</label><input className="input" type="time" step={1800} value={f.hora} onChange={e => setF({ ...f, hora: e.target.value })} /></div>
        </div>
        {erro && <p className="text-sm text-red-600 font-semibold">⛔ {erro}</p>}
        <button className="btn-dark w-full py-3" disabled={!f.contactId || !!erro} onClick={() => {
          set(st => ({
            ...st,
            appts: [...st.appts, { id: uid(), contactId: f.contactId, profId: f.profId, serviceId: f.serviceId, data: dia, hora: f.hora, status: 'marcado' }],
            contacts: st.contacts.map(c => (c.id === f.contactId && c.tagId === 't2' ? { ...c, tagId: 't1' } : c)),
          }))
          toast('Consulta marcada'); fechar()
        }}>Marcar consulta</button>
      </div>
    </Modal>
  )
}

// ---------- 5. Sumidos ----------
export function Sumidos() {
  const { s, set, toast } = useApp()
  const lista = sumidos(s).filter(x => !s.envios.some(e => e.contactId === x.contact.id && e.dia === hoje()))
  if (!lista.length) return <Vazio><p className="font-bold text-ink">Ninguém sumido agora.</p><p>Quem passar do prazo de retorno aparece aqui sozinho.</p></Vazio>
  return (
    <div className="space-y-3">
      {lista.map(x => {
        const texto = mensagem(s, 'sumido', x.contact, { procedimento: x.service.nome })
        return (
          <div key={x.contact.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1"><Avatar nome={x.contact.nome} />
              <div><p className="font-bold">{x.contact.nome}</p><p className="text-sm text-violet-700 font-semibold">Há {x.dias} dias sem voltar · {x.service.nome} em {fmtDia(x.proc.data)}</p></div></div>
            <button className="btn-send" onClick={() => { set(st => enviar(st, x.contact.id, texto, 'sumido')); toast('Mensagem de volta na fila do WhatsApp') }}>Enviar ➤</button>
          </div>
        )
      })}
    </div>
  )
}

// ---------- 6. Resumo ----------
export function Resumo() {
  const { s } = useApp()
  const soma = (f: (q: Quote) => number) => s.quotes.reduce((t, q) => t + f(q), 0)
  const fechado = soma(q => (q.coluna === 'fechou' || q.coluna === 'fechou_parcial' ? q.fechado : 0))
  const duvida = soma(q => (q.coluna === 'em_duvida' ? q.total : 0))
  const recusou = soma(q => (q.coluna === 'recusou' ? q.total : 0))
  const recuperado = soma(q => (q.recuperado ? q.fechado : 0))
  const chamadas = new Set(s.envios.filter(e => e.motivo !== 'respondeu').map(e => e.contactId)).size
  const responderam = new Set(s.envios.filter(e => e.motivo === 'respondeu').map(e => e.contactId)).size
  const Box = ({ t, v, cor }: { t: string; v: string; cor?: string }) => (
    <div className="card p-4"><p className="text-xs font-bold text-black/50 uppercase">{t}</p><p className="text-2xl font-extrabold" style={{ color: cor }}>{v}</p></div>
  )
  return (
    <div className="space-y-4">
      <div className="hidden print:flex items-center gap-3 mb-4"><img src="/favicon.svg" className="w-12" alt="" /><div><p className="font-extrabold text-xl">{s.clinica.nome}</p><p className="text-sm">Relatório do dia 30</p></div></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Box t="A receber (fechado)" v={brl(fechado)} cor="#16a34a" />
        <Box t="Em dúvida" v={brl(duvida)} cor="#d97706" />
        <Box t="Recusou" v={brl(recusou)} cor="#dc2626" />
        <Box t="Recuperado" v={brl(recuperado)} cor="#2563eb" />
      </div>
      <div className="card p-4">
        <p className="font-extrabold mb-3">Antes e agora</p>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl bg-black/5 p-3"><p className="text-black/50 font-semibold">Parado no dia 7</p><p className="text-2xl font-extrabold">{brl(s.dia7.parado)}</p><p className="text-black/50">{s.dia7.emDuvida} em dúvida</p></div>
          <div className="rounded-xl bg-cream p-3"><p className="text-black/50 font-semibold">Parado hoje</p><p className="text-2xl font-extrabold">{brl(valorParado(s))}</p><p className="text-black/50">{s.quotes.filter(q => q.coluna === 'em_duvida').length} em dúvida</p></div>
        </div>
        <ul className="mt-4 text-sm space-y-1">
          <li>📣 Pessoas chamadas: <b>{chamadas}</b></li>
          <li>💬 Responderam: <b>{responderam}</b></li>
          <li>✅ Fecharam depois de um contato: <b>{s.quotes.filter(q => q.recuperado).length}</b></li>
        </ul>
      </div>
      <div className="card p-4">
        <p className="font-extrabold mb-2">Consultas por profissional</p>
        {s.profs.map(p => {
          const a = s.appts.filter(x => x.profId === p.id)
          return <p key={p.id} className="text-sm py-1">{p.nome}: <b>{a.filter(x => x.status === 'realizado').length}</b> realizadas · <b>{a.filter(x => x.status === 'faltou').length}</b> faltas</p>
        })}
      </div>
      <button className="btn-dark no-print" onClick={() => window.print()}>⬇️ Baixar relatório do dia 30 (PDF)</button>
    </div>
  )
}

// ---------- 8. Ajustes ----------
export function Ajustes() {
  const { s, set, reset, toast } = useApp()
  const [aba, setAba] = useState('servicos')
  const up = <K extends keyof State>(k: K, v: State[K]) => set(st => ({ ...st, [k]: v }))
  const abas = [['servicos', 'Serviços'], ['etiquetas', 'Etiquetas'], ['profs', 'Profissionais'], ['mensagens', 'Mensagens'], ['clinica', 'Clínica'], ['whats', 'WhatsApp']]
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto">
        {abas.map(([id, n]) => <button key={id} onClick={() => setAba(id)} className={`rounded-full px-4 py-1.5 text-sm font-bold whitespace-nowrap ${aba === id ? 'bg-ink text-cream' : 'bg-black/5'}`}>{n}</button>)}
      </div>

      {aba === 'servicos' && <div className="card divide-y divide-black/5">
        {s.services.map((x, i) => (
          <div key={x.id} className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
            <div className="col-span-2 md:col-span-1"><label className="label">Serviço</label><input className="input" value={x.nome} onChange={e => up('services', s.services.map((y, j) => (j === i ? { ...y, nome: e.target.value } : y)))} /></div>
            <div><label className="label">Preço (R$)</label><input className="input" inputMode="numeric" value={x.preco} onChange={e => up('services', s.services.map((y, j) => (j === i ? { ...y, preco: Number(e.target.value) || 0 } : y)))} /></div>
            <div><label className="label">Duração (min)</label><input className="input" inputMode="numeric" value={x.duracao} onChange={e => up('services', s.services.map((y, j) => (j === i ? { ...y, duracao: Number(e.target.value) || 30 } : y)))} /></div>
            <div className="col-span-2 md:col-span-1"><label className="label">Volta depois de (dias)</label><input className="input" inputMode="numeric" value={x.retorno} onChange={e => up('services', s.services.map((y, j) => (j === i ? { ...y, retorno: Number(e.target.value) || 0 } : y)))} /></div>
          </div>
        ))}
        <div className="p-3"><button className="btn-ghost" onClick={() => up('services', [...s.services, { id: uid(), nome: 'Novo serviço', preco: 0, duracao: 30, retorno: 90 }])}>+ Adicionar serviço</button></div>
      </div>}

      {aba === 'etiquetas' && <div className="card divide-y divide-black/5">
        {s.tags.map((t, i) => (
          <div key={t.id} className="p-3 flex items-center gap-2">
            <input type="color" value={t.cor} className="w-9 h-9 rounded-lg" onChange={e => up('tags', s.tags.map((y, j) => (j === i ? { ...y, cor: e.target.value } : y)))} />
            <input className="input flex-1" value={t.nome} onChange={e => up('tags', s.tags.map((y, j) => (j === i ? { ...y, nome: e.target.value } : y)))} />
            <label className="text-xs font-semibold flex items-center gap-1 whitespace-nowrap"><input type="checkbox" checked={t.painel} onChange={e => up('tags', s.tags.map((y, j) => (j === i ? { ...y, painel: e.target.checked } : y)))} /> Vai para o Painel</label>
          </div>
        ))}
        <div className="p-3"><button className="btn-ghost" onClick={() => up('tags', [...s.tags, { id: uid(), nome: 'Nova etiqueta', cor: '#6366f1', painel: false }])}>+ Nova etiqueta</button></div>
      </div>}

      {aba === 'profs' && <div className="card divide-y divide-black/5">
        {s.profs.map((p, i) => (
          <div key={p.id} className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
            <div className="col-span-2"><label className="label">Nome</label><input className="input" value={p.nome} onChange={e => up('profs', s.profs.map((y, j) => (j === i ? { ...y, nome: e.target.value } : y)))} /></div>
            <div><label className="label">Começa</label><input className="input" type="time" value={p.inicio} onChange={e => up('profs', s.profs.map((y, j) => (j === i ? { ...y, inicio: e.target.value } : y)))} /></div>
            <div><label className="label">Termina</label><input className="input" type="time" value={p.fim} onChange={e => up('profs', s.profs.map((y, j) => (j === i ? { ...y, fim: e.target.value } : y)))} /></div>
          </div>
        ))}
      </div>}

      {aba === 'mensagens' && <div className="card divide-y divide-black/5">
        <p className="p-3 text-xs text-black/50">Use {'{nome}'}, {'{procedimento}'}, {'{valor}'} e {'{clinica}'}. Eles são trocados sozinhos.</p>
        {Object.entries(s.templates).map(([k, v]) => (
          <div key={k} className="p-3"><label className="label">{k.replace(/_/g, ' ').replace('ideia', 'Ideia ·')}</label>
            <textarea className="input min-h-16" value={v} onChange={e => up('templates', { ...s.templates, [k]: e.target.value })} /></div>
        ))}
      </div>}

      {aba === 'clinica' && <div className="card p-4 space-y-3 max-w-md">
        <div><label className="label">Nome da clínica</label><input className="input" value={s.clinica.nome} onChange={e => up('clinica', { ...s.clinica, nome: e.target.value })} /></div>
        <div><label className="label">Esfria depois de quantos dias sem contato</label><input className="input" inputMode="numeric" value={s.clinica.prazoEsfriar} onChange={e => up('clinica', { ...s.clinica, prazoEsfriar: Number(e.target.value) || 1 })} /></div>
        <button className="btn-ghost text-red-600" onClick={() => { if (confirm('Voltar aos dados de exemplo?')) { reset(); toast('Demonstração reiniciada') } }}>Reiniciar demonstração</button>
      </div>}

      {aba === 'whats' && <WhatsAppAjustes />}
    </div>
  )
}

function WhatsAppAjustes() {
  const { st } = useStatusWpp(5000)
  return (
    <div className="card p-4 space-y-4 max-w-md">
      <p className="font-bold">WhatsApp da clínica</p>
      <ConectarWhatsApp />
      {st?.estado === 'open' && <Desconectar />}
      <p className="text-xs text-black/50">Proteção do número: até 40 mensagens por dia, intervalo de 20 a 60s entre envios, só das 8h às 20h, nada de envio em massa.</p>
    </div>
  )
}
