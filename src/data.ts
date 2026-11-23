// Dados fictícios da demonstração + regras do Método dos 3 Furos.

export type Coluna = 'para_organizar' | 'em_duvida' | 'fechou' | 'fechou_parcial' | 'recusou'
export type StatusConsulta = 'marcado' | 'confirmado' | 'realizado' | 'faltou' | 'cancelado'

export interface Tag { id: string; nome: string; cor: string; painel: boolean }
export interface Service { id: string; nome: string; preco: number; duracao: number; retorno: number }
export interface Professional { id: string; nome: string; cor: string; inicio: string; fim: string }
export interface Contact { id: string; nome: string; fone: string; tagId: string | null; atentar: string; novo: boolean }
export interface Msg { id: string; contactId: string; dir: 'in' | 'out'; texto: string; ts: number }
export interface Quote {
  id: string; contactId: string; serviceId: string; coluna: Coluna
  total: number; fechado: number; atentar: string
  dataOrc: string; ultimoContato: string; tentativas: number; recuperado?: boolean
}
export interface Appt { id: string; contactId: string; profId: string; serviceId: string; data: string; hora: string; status: StatusConsulta }
export interface Proc { id: string; contactId: string; serviceId: string; data: string; valor: number }
export interface Envio { contactId: string; dia: string; motivo: string }

export interface State {
  clinica: { nome: string; prazoEsfriar: number; ativacao: string }
  tags: Tag[]; services: Service[]; profs: Professional[]
  contacts: Contact[]; msgs: Msg[]; quotes: Quote[]; appts: Appt[]; procs: Proc[]; envios: Envio[]
  templates: Record<string, string>
  dia7: { parado: number; cards: number; emDuvida: number }
}

// ---------- datas ----------
export const hoje = () => iso(new Date())
export function iso(d: Date) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
export function addDias(dia: string, n: number) {
  const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d)
}
export function diasDesde(dia: string, ref = hoje()) {
  return Math.round((new Date(ref + 'T12:00:00').getTime() - new Date(dia + 'T12:00:00').getTime()) / 86400000)
}
export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
export const fmtDia = (dia: string) => new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
export const uid = () => Math.random().toString(36).slice(2, 10)
export const hm = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b }
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export const COLUNAS: { id: Coluna; nome: string; cor: string }[] = [
  { id: 'para_organizar', nome: 'Para organizar', cor: '#a3a3a3' },
  { id: 'em_duvida', nome: 'Em dúvida', cor: '#f59e0b' },
  { id: 'fechou', nome: 'Fechou', cor: '#16a34a' },
  { id: 'fechou_parcial', nome: 'Fechou parte', cor: '#0d9488' },
  { id: 'recusou', nome: 'Recusou', cor: '#dc2626' },
]

// ---------- regras ----------
export const valorParado = (s: State) =>
  s.quotes.reduce((t, q) => t + (q.coluna === 'em_duvida' ? q.total : q.coluna === 'fechou_parcial' ? Math.max(0, q.total - q.fechado) : 0), 0)

export const esfriou = (s: State, q: Quote) => q.coluna === 'em_duvida' && diasDesde(q.ultimoContato) >= s.clinica.prazoEsfriar

export function preencher(texto: string, vars: Record<string, string>) {
  return texto.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m)
}
export const primeiroNome = (n: string) => n.split(' ')[0]

export function mensagem(s: State, tipo: string, c: Contact, extra: Record<string, string> = {}) {
  return preencher(s.templates[tipo] ?? '', { nome: primeiroNome(c.nome), clinica: s.clinica.nome, ...extra })
}

export interface ItemChamar { contact: Contact; motivo: string; tipo: string; valor: number; texto: string; quoteId?: string; cor: string }

export function sumidos(s: State) {
  const d = hoje()
  const ultimo = new Map<string, Proc>()
  for (const p of s.procs) { const u = ultimo.get(p.contactId); if (!u || u.data < p.data) ultimo.set(p.contactId, p) }
  const out: { contact: Contact; proc: Proc; service: Service; dias: number }[] = []
  for (const [cid, p] of ultimo) {
    const sv = s.services.find(x => x.id === p.serviceId); const c = s.contacts.find(x => x.id === cid)
    if (!sv || !c) continue
    const vence = addDias(p.data, sv.retorno)
    if (vence >= d) continue
    if (s.appts.some(a => a.contactId === cid && a.data >= d && a.status !== 'cancelado')) continue
    if (s.quotes.some(q => q.contactId === cid && (q.coluna === 'em_duvida' || q.coluna === 'para_organizar'))) continue
    out.push({ contact: c, proc: p, service: sv, dias: diasDesde(vence) })
  }
  return out.sort((a, b) => b.dias - a.dias)
}

export function chamarHoje(s: State): ItemChamar[] {
  const d = hoje()
  const jaHoje = new Set(s.envios.filter(e => e.dia === d).map(e => e.contactId))
  const svc = (id: string) => s.services.find(x => x.id === id)
  const itens: ItemChamar[] = []
  for (const q of s.quotes) {
    const c = s.contacts.find(x => x.id === q.contactId); if (!c || jaHoje.has(c.id) || q.tentativas >= 3) continue
    const vars = { procedimento: svc(q.serviceId)?.nome ?? 'procedimento', valor: brl(q.total) }
    const dias = diasDesde(q.ultimoContato)
    if (q.coluna === 'em_duvida') {
      if (esfriou(s, q)) itens.push({ contact: c, motivo: `Esfriou · ${dias} dias sem contato`, tipo: 'esfriou', valor: q.total, quoteId: q.id, cor: '#2563eb', texto: mensagem(s, 'esfriou', c, vars) })
      else if (dias === 2) itens.push({ contact: c, motivo: 'Retorno do dia 2', tipo: 'retorno_dia2', valor: q.total, quoteId: q.id, cor: '#f59e0b', texto: mensagem(s, 'retorno_dia2', c, vars) })
    } else if (q.coluna === 'fechou_parcial' && dias >= 7) {
      itens.push({ contact: c, motivo: `Plano pela metade (falta ${brl(q.total - q.fechado)})`, tipo: 'plano_incompleto', valor: q.total - q.fechado, quoteId: q.id, cor: '#0d9488', texto: mensagem(s, 'plano_incompleto', c, vars) })
    }
  }
  for (const x of sumidos(s)) {
    if (jaHoje.has(x.contact.id)) continue
    itens.push({ contact: x.contact, motivo: `Sumida há ${x.dias} dias`, tipo: 'sumido', valor: x.service.preco, cor: '#7c3aed', texto: mensagem(s, 'sumido', x.contact, { procedimento: x.service.nome }) })
  }
  const esperando = s.tags.find(t => t.nome === 'Esperando agendamento')
  for (const c of s.contacts) {
    if (c.tagId !== esperando?.id || jaHoje.has(c.id)) continue
    if (s.appts.some(a => a.contactId === c.id && a.data >= d)) continue
    itens.push({ contact: c, motivo: 'Esperando agendamento', tipo: 'agendar', valor: 0, cor: '#db2777', texto: mensagem(s, 'agendar', c) })
  }
  return itens.sort((a, b) => b.valor - a.valor)
}

// ---------- dados fictícios ----------
export function seed(): State {
  const d = hoje()
  const tags: Tag[] = [
    { id: 't1', nome: 'Cliente', cor: '#16a34a', painel: false },
    { id: 't2', nome: 'Esperando agendamento', cor: '#db2777', painel: false },
    { id: 't3', nome: 'Orçamento enviado', cor: '#f59e0b', painel: true },
    { id: 't4', nome: 'Em tratamento', cor: '#0d9488', painel: true },
    { id: 't5', nome: 'Não é paciente', cor: '#737373', painel: false },
  ]
  const services: Service[] = [
    { id: 's1', nome: 'Botox', preco: 1200, duracao: 30, retorno: 120 },
    { id: 's2', nome: 'Preenchimento labial', preco: 1500, duracao: 60, retorno: 240 },
    { id: 's3', nome: 'Bioestimulador', preco: 2800, duracao: 60, retorno: 90 },
    { id: 's4', nome: 'Limpeza de pele', preco: 250, duracao: 60, retorno: 30 },
    { id: 's5', nome: 'Fios de PDO', preco: 3500, duracao: 90, retorno: 180 },
    { id: 's6', nome: 'Avaliação', preco: 0, duracao: 30, retorno: 365 },
  ]
  const profs: Professional[] = [
    { id: 'p1', nome: 'Dra. Elizabeth', cor: '#0b0b0b', inicio: '09:00', fim: '18:00' },
    { id: 'p2', nome: 'Dra. Camila', cor: '#b45309', inicio: '13:00', fim: '20:00' },
  ]
  const nomes = ['Mariana Souza', 'Juliana Lima', 'Patrícia Alves', 'Fernanda Rocha', 'Beatriz Costa', 'Aline Martins', 'Carla Mendes', 'Renata Dias', 'Larissa Pires', 'Tatiane Gomes', 'Vanessa Freitas', 'Débora Nunes', 'Gabriela Reis', 'Amanda Teixeira']
  const tagDe = ['t3', 't3', 't3', 't3', 't4', 't3', 't1', 't1', 't2', 't2', null, null, 't1', 't3']
  const atentar = ['Tem medo de agulha', 'Só pode à tarde', '', 'Pediu parcelamento em 3x', '', '', '', 'Prefere a Dra. Camila', '', '', '', '', '', 'Vem com a mãe']
  const contacts: Contact[] = nomes.map((nome, i) => ({
    id: 'c' + i, nome, fone: `+55 11 9${String(8100 + i * 37).padStart(4, '0')}-${String(1000 + i * 211).slice(0, 4)}`,
    tagId: tagDe[i], atentar: atentar[i], novo: tagDe[i] === null,
  }))
  const Q = (i: number, sv: string, coluna: Coluna, total: number, diasAtras: number, fechado = 0, tent = 1): Quote => ({
    id: 'q' + i, contactId: 'c' + i, serviceId: sv, coluna, total, fechado, atentar: atentar[i],
    dataOrc: addDias(d, -diasAtras - 2), ultimoContato: addDias(d, -diasAtras), tentativas: tent,
  })
  const quotes: Quote[] = [
    Q(0, 's3', 'em_duvida', 2800, 5),
    Q(1, 's2', 'em_duvida', 1500, 2),
    Q(2, 's5', 'em_duvida', 3500, 4, 0, 2),
    Q(3, 's1', 'em_duvida', 1200, 1),
    Q(4, 's3', 'fechou_parcial', 8400, 9, 2800),
    Q(5, 's2', 'para_organizar', 0, 0, 0, 0),
    Q(13, 's1', 'para_organizar', 0, 0, 0, 0),
    Q(6, 's1', 'fechou', 1200, 12, 1200),
    Q(7, 's4', 'recusou', 250, 20),
  ]
  const procs: Proc[] = [
    { id: 'pr1', contactId: 'c6', serviceId: 's4', data: addDias(d, -48), valor: 250 },
    { id: 'pr2', contactId: 'c7', serviceId: 's1', data: addDias(d, -140), valor: 1200 },
    { id: 'pr3', contactId: 'c12', serviceId: 's3', data: addDias(d, -100), valor: 2800 },
  ]
  const appts: Appt[] = [
    { id: 'a1', contactId: 'c4', profId: 'p1', serviceId: 's3', data: d, hora: '10:00', status: 'confirmado' },
    { id: 'a2', contactId: 'c6', profId: 'p2', serviceId: 's1', data: d, hora: '15:00', status: 'marcado' },
    { id: 'a3', contactId: 'c3', profId: 'p1', serviceId: 's6', data: addDias(d, 1), hora: '11:00', status: 'marcado' },
  ]
  const now = Date.now(); const H = 3600000
  const conv: [number, 'in' | 'out', string, number][] = [
    [0, 'in', 'Oi! Quanto fica o bioestimulador?', 130], [0, 'out', 'Oi Mariana! Fica R$ 2.800, dá pra parcelar 😊', 129], [0, 'in', 'Vou pensar e te falo', 128],
    [1, 'in', 'Vocês fazem preenchimento labial?', 50], [1, 'out', 'Fazemos sim! O valor é R$ 1.500.', 49],
    [2, 'in', 'Queria saber dos fios', 100], [2, 'out', 'Claro! O protocolo completo fica R$ 3.500.', 99],
    [3, 'in', 'Qual o valor do botox?', 26], [3, 'out', 'R$ 1.200, Fernanda. Quer agendar uma avaliação?', 25],
    [5, 'in', 'Me passa o valor do preenchimento?', 3],
    [8, 'in', 'Quero marcar a limpeza de pele', 30],
    [9, 'in', 'Tem horário semana que vem?', 60],
    [10, 'in', 'Boa tarde! Vi vocês no Instagram 💜', 1],
    [11, 'in', 'Oi, vocês atendem sábado?', 0.5],
    [13, 'in', 'Quanto custa o botox? Quero fazer antes do casamento', 2],
    [4, 'in', 'Amei o resultado da primeira sessão!', 200], [6, 'in', 'Obrigada pelo atendimento!', 300], [7, 'in', 'Até a próxima!', 900], [12, 'in', 'Beijos!', 1500],
  ]
  const msgs: Msg[] = conv.map(([i, dir, texto, h], k) => ({ id: 'm' + k, contactId: 'c' + i, dir, texto, ts: now - h * H }))
  const templates: Record<string, string> = {
    ideia_em_duvida: 'Oi {nome}! Aqui é da {clinica} 😊 Ficou alguma dúvida sobre o {procedimento}? Posso te explicar as formas de pagamento.',
    ideia_fechou: 'Que alegria, {nome}! Seu {procedimento} está confirmado. Qualquer dúvida antes do dia, é só chamar aqui 💛',
    ideia_fechou_parcial: 'Oi {nome}! Já deixamos a primeira parte do seu {procedimento} certinha. Quando quiser, a gente organiza o restante do plano.',
    ideia_recusou: 'Tudo bem, {nome}! Obrigada por considerar a {clinica}. Se mudar de ideia, estamos aqui 😊',
    ideia_para_organizar: 'Oi {nome}! Aqui é da {clinica}. Posso te ajudar com o {procedimento}?',
    retorno_dia2: 'Oi {nome}, tudo bem? Passando para saber se ficou alguma dúvida sobre o {procedimento} 😊',
    esfriou: 'Oi {nome}! Lembrei de você 💛 Ainda tem interesse no {procedimento}? Essa semana tenho horários bons.',
    plano_incompleto: 'Oi {nome}! Como você está com o resultado? Vamos marcar a próxima etapa do seu {procedimento}?',
    sumido: 'Oi {nome}, saudade! Já faz um tempo do seu {procedimento}. Que tal agendar a manutenção? 😊',
    agendar: 'Oi {nome}! Vamos achar um horário para você? Me diz qual dia fica melhor 😊',
  }
  return {
    clinica: { nome: 'Clínica Elizabeth', prazoEsfriar: 3, ativacao: addDias(d, -10) },
    tags, services, profs, contacts, msgs, quotes, appts, procs, envios: [], templates,
    dia7: { parado: 10300, cards: 7, emDuvida: 5 },
  }
}
