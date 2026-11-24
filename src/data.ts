// Dados da OrtoClin (demonstração) + regras do Método dos 3 Furos.

export type Coluna = 'para_organizar' | 'em_duvida' | 'fechou' | 'fechou_parcial' | 'recusou'
export type StatusConsulta = 'marcado' | 'confirmado' | 'realizado' | 'faltou' | 'cancelado'
export type Origem = 'Anúncio' | 'Site' | 'Instagram' | 'Indicação' | 'Outro'
export type Situacao = 'feita' | 'agendada' | 'pendente'
export const ORIGENS: Origem[] = ['Anúncio', 'Site', 'Instagram', 'Indicação', 'Outro']

export interface Tag { id: string; nome: string; cor: string; painel: boolean }
export interface Service { id: string; nome: string; preco: number; duracao: number; retorno: number } // retorno 0 = sem retorno
export interface Professional { id: string; nome: string; cor: string; horario: Record<number, string> } // 0=dom … 6=sáb, "08:00-12:00,14:00-19:00"
export interface Contact {
  id: string; nome: string; fone: string; tagId: string | null; atentar: string
  origem: Origem; manutencao?: number // dias entre manutenções do aparelho (só quem está em tratamento ortodôntico)
  real?: boolean // veio do WhatsApp de verdade (mensagens lidas da Evolution e enviadas de verdade)
  foto?: string | null
  ultima?: { texto: string; deMim: boolean; ts: number } // última mensagem real vista
}
export interface Msg { id: string; contactId: string; dir: 'in' | 'out'; texto: string; ts: number }
export interface Etapa { id: string; nome: string; valor: number; situacao: Situacao }
export interface Quote {
  id: string; contactId: string; serviceId: string; coluna: Coluna
  total: number; fechado: number; atentar: string
  dataOrc: string; ultimoContato: string; tentativas: number
  recuperado?: boolean; etapas?: Etapa[]; concluidoEm?: string
}
export interface Appt {
  id: string; contactId: string; profId: string; serviceId: string; data: string; hora: string
  status: StatusConsulta; confirmacao?: 'confirmou' | 'remarcar'; obs?: string
}
export interface Proc { id: string; contactId: string; serviceId: string; data: string; valor: number }
export interface Envio { contactId: string; dia: string; motivo: string }

export interface State {
  clinica: { nome: string; subtitulo: string; endereco: string; prazoEsfriar: number; ativacao: string; confirmacaoVespera: boolean; horaConfirmacao: string; conversasReais?: boolean }
  tags: Tag[]; services: Service[]; profs: Professional[]
  contacts: Contact[]; msgs: Msg[]; quotes: Quote[]; appts: Appt[]; procs: Proc[]; envios: Envio[]
  templates: Record<string, string>
  dia7: { parado: number; cards: number; emDuvida: number }
}

// IDs fixos usados pelas regras
export const T = { novo: 'tnovo', orc: 'torc', esp: 'tesp', trat: 'ttrat', cli: 'tcli', nao: 'tnao' }
export const S = { aval: 'saval', limp: 'slimp', rest: 'srest', clc: 'sclc', clo: 'sclo', inst: 'sinst', man: 'sman' }

// ---------- datas e formatos ----------
export const hoje = () => iso(new Date())
export function iso(d: Date) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
export function addDias(dia: string, n: number) { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d) }
export function diasDesde(dia: string, ref = hoje()) { return Math.round((new Date(ref + 'T12:00:00').getTime() - new Date(dia + 'T12:00:00').getTime()) / 86400000) }
export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
export const fmtDia = (dia: string) => new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
export const diaSemana = (dia: string) => new Date(dia + 'T12:00:00').getDay()
export const uid = () => Math.random().toString(36).slice(2, 10)
export const hm = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + (b || 0) }
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export const primeiroNome = (n: string) => n.split(' ')[0]

export const COLUNAS: { id: Coluna; nome: string; cor: string }[] = [
  { id: 'para_organizar', nome: 'Para organizar', cor: '#A89F92' },
  { id: 'em_duvida', nome: 'Em dúvida', cor: '#D08C2E' },
  { id: 'fechou', nome: 'Fechou', cor: '#4F8A3C' },
  { id: 'fechou_parcial', nome: 'Fechou parte', cor: '#B8913F' },
  { id: 'recusou', nome: 'Recusou', cor: '#B5544B' },
]

// ---------- expediente ----------
export function intervalos(p: Professional, dia: string): [number, number][] {
  return (p.horario[diaSemana(dia)] || '').split(',').map(x => x.trim()).filter(Boolean)
    .map(x => { const [a, b] = x.split('-'); return [hm(a), hm(b)] as [number, number] })
}
export const dentroExpediente = (p: Professional, dia: string, ini: number, fim: number) => intervalos(p, dia).some(([a, b]) => ini >= a && fim <= b)
export const durDe = (s: State, serviceId: string) => s.services.find(x => x.id === serviceId)?.duracao ?? 30

export function conflito(s: State, profId: string, dia: string, hora: string, serviceId: string, ignorar?: string) {
  const ini = hm(hora), fim = ini + durDe(s, serviceId)
  return s.appts.find(a => a.id !== ignorar && a.profId === profId && a.data === dia && a.status !== 'cancelado'
    && hm(a.hora) < fim && hm(a.hora) + durDe(s, a.serviceId) > ini)
}

export function primeiroHorarioLivre(s: State, profId: string, dia: string, serviceId: string) {
  const p = s.profs.find(x => x.id === profId); if (!p) return null
  const dur = durDe(s, serviceId)
  const agora = dia === hoje() ? new Date().getHours() * 60 + new Date().getMinutes() : 0
  for (const [a, b] of intervalos(p, dia)) {
    for (let m = a; m + dur <= b; m += 10) {
      if (m < agora) continue
      if (!conflito(s, profId, dia, hhmm(m), serviceId)) return hhmm(m)
    }
  }
  return null
}

// ---------- valores ----------
export const falta = (q: Quote) => q.etapas?.length ? q.etapas.filter(e => e.situacao === 'pendente').reduce((t, e) => t + e.valor, 0) : Math.max(0, q.total - q.fechado)
export const valorFechado = (q: Quote) => q.etapas?.length ? q.etapas.filter(e => e.situacao !== 'pendente').reduce((t, e) => t + e.valor, 0) : q.fechado
export const proximaEtapa = (q: Quote) => q.etapas?.find(e => e.situacao === 'pendente')

/** Parado = orçamentos em dúvida + o que falta dos planos pela metade. */
export const valorParado = (s: State) => s.quotes.reduce((t, q) => t + (q.coluna === 'em_duvida' ? q.total : q.coluna === 'fechou_parcial' ? falta(q) : 0), 0)
export const esfriou = (s: State, q: Quote) => q.coluna === 'em_duvida' && diasDesde(q.ultimoContato) >= s.clinica.prazoEsfriar

export function preencher(texto: string, vars: Record<string, string>) { return texto.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m) }
export function mensagem(s: State, tipo: string, c: Contact, extra: Record<string, string> = {}) {
  return preencher(s.templates[tipo] ?? '', { nome: primeiroNome(c.nome), clinica: s.clinica.nome, profissional: s.profs[0]?.nome ?? '', ...extra })
}

// ---------- manutenções do aparelho ----------
export type StatusManut = 'atrasada' | 'faltou' | 'a_marcar' | 'marcou' | 'em_dia'
export interface Manutencao { contact: Contact; ultima?: string; vence: string; status: StatusManut; dias: number; appt?: Appt }

export function manutencoes(s: State): Manutencao[] {
  const d = hoje()
  const out: Manutencao[] = []
  for (const c of s.contacts) {
    if (!c.manutencao) continue
    const ultima = s.procs.filter(p => p.contactId === c.id && (p.serviceId === S.man || p.serviceId === S.inst)).map(p => p.data).sort().pop()
    const vence = ultima ? addDias(ultima, c.manutencao) : d
    const futura = s.appts.filter(a => a.contactId === c.id && a.serviceId === S.man && a.data >= d && (a.status === 'marcado' || a.status === 'confirmado'))
      .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))[0]
    const falta = s.appts.filter(a => a.contactId === c.id && a.serviceId === S.man && a.status === 'faltou' && (!ultima || a.data > ultima)).sort((a, b) => a.data.localeCompare(b.data)).pop()
    let status: StatusManut
    if (futura) status = 'marcou'
    else if (falta) status = 'faltou'
    else if (vence < d) status = 'atrasada'
    else if (diasDesde(d, vence) <= 10) status = 'a_marcar'
    else status = 'em_dia'
    out.push({ contact: c, ultima, vence, status, dias: diasDesde(vence), appt: futura ?? falta })
  }
  const ordem: StatusManut[] = ['atrasada', 'faltou', 'a_marcar', 'marcou', 'em_dia']
  return out.sort((a, b) => ordem.indexOf(a.status) - ordem.indexOf(b.status) || b.dias - a.dias)
}

// ---------- sumidos ----------
export function sumidos(s: State) {
  const d = hoje()
  const ultimo = new Map<string, Proc>()
  for (const p of s.procs) { const u = ultimo.get(p.contactId); if (!u || u.data < p.data) ultimo.set(p.contactId, p) }
  const out: { contact: Contact; proc: Proc; service: Service; dias: number }[] = []
  for (const [cid, p] of ultimo) {
    const sv = s.services.find(x => x.id === p.serviceId); const c = s.contacts.find(x => x.id === cid)
    if (!sv || !c || !sv.retorno || c.manutencao) continue // aparelho é tratado em Manutenções
    const vence = addDias(p.data, sv.retorno)
    if (vence >= d) continue
    if (s.appts.some(a => a.contactId === cid && a.data >= d && a.status !== 'cancelado')) continue
    if (s.quotes.some(q => q.contactId === cid && (q.coluna === 'em_duvida' || q.coluna === 'para_organizar'))) continue
    out.push({ contact: c, proc: p, service: sv, dias: diasDesde(vence) })
  }
  return out.sort((a, b) => b.dias - a.dias)
}

// ---------- chamar hoje ----------
export type TipoAviso = 'esfriou' | 'retorno' | 'plano' | 'manut' | 'sumida' | 'agendar' | 'indicacao'
export interface ItemChamar { contact: Contact; motivo: string; aviso: TipoAviso; valor: number; texto: string; quoteId?: string; serviceId?: string }

export function chamarHoje(s: State): ItemChamar[] {
  const d = hoje()
  const jaHoje = new Set(s.envios.filter(e => e.dia === d).map(e => e.contactId))
  const svc = (id: string) => s.services.find(x => x.id === id)
  const itens: ItemChamar[] = []
  const tem = new Set<string>()
  const add = (i: ItemChamar) => { if (jaHoje.has(i.contact.id) || tem.has(i.contact.id)) return; tem.add(i.contact.id); itens.push(i) }
  const ctt = (id: string) => s.contacts.find(x => x.id === id)

  for (const m of manutencoes(s)) {
    if (m.status !== 'atrasada' && m.status !== 'faltou') continue
    add({ contact: m.contact, aviso: 'manut', valor: svc(S.man)?.preco ?? 0, serviceId: S.man,
      motivo: m.status === 'faltou' ? `Faltou à manutenção de ${fmtDia(m.appt!.data)}` : `Manutenção atrasada há ${m.dias} dia(s)`,
      texto: mensagem(s, 'manutencao_atrasada', m.contact) })
  }
  for (const q of s.quotes) {
    const c = ctt(q.contactId); if (!c || q.tentativas >= 3) continue
    const vars = { procedimento: (svc(q.serviceId)?.nome ?? 'o tratamento').toLowerCase(), valor: brl(q.total) }
    const dias = diasDesde(q.ultimoContato)
    if (q.coluna === 'em_duvida') {
      if (esfriou(s, q)) add({ contact: c, motivo: `Esfriou · ${dias} dias sem contato`, aviso: 'esfriou', valor: q.total, quoteId: q.id, serviceId: q.serviceId, texto: mensagem(s, 'esfriou', c, vars) })
      else if (dias === 2) add({ contact: c, motivo: 'Retorno do dia 2', aviso: 'retorno', valor: q.total, quoteId: q.id, serviceId: q.serviceId, texto: mensagem(s, 'retorno_dia2', c, vars) })
    } else if (q.coluna === 'fechou_parcial' && dias >= 7 && falta(q) > 0) {
      const prox = proximaEtapa(q)
      add({ contact: c, motivo: prox ? `Próxima etapa: ${prox.nome} (falta ${brl(falta(q))})` : `Plano pela metade (falta ${brl(falta(q))})`, aviso: 'plano', valor: falta(q), quoteId: q.id,
        texto: mensagem(s, 'proxima_etapa', c, { ...vars, etapa: (prox?.nome ?? 'o restante do plano').toLowerCase() }) })
    }
  }
  for (const q of s.quotes) {
    const c = ctt(q.contactId)
    if (!c || !q.concluidoEm || diasDesde(q.concluidoEm) < 7) continue
    if (s.envios.some(e => e.contactId === c.id && e.motivo === 'indicacao')) continue
    add({ contact: c, motivo: 'Tratamento concluído · pedir indicação', aviso: 'indicacao', valor: 0, texto: mensagem(s, 'indicacao', c) })
  }
  for (const x of sumidos(s)) add({ contact: x.contact, motivo: `Sumida há ${x.dias} dias`, aviso: 'sumida', valor: x.service.preco, serviceId: x.service.id, texto: mensagem(s, 'sumido', x.contact, { procedimento: x.service.nome.toLowerCase() }) })
  for (const c of s.contacts) {
    if (c.tagId !== T.esp || s.appts.some(a => a.contactId === c.id && a.data >= d && a.status !== 'cancelado')) continue
    add({ contact: c, motivo: 'Esperando agendamento', aviso: 'agendar', valor: 0, serviceId: S.aval, texto: mensagem(s, 'agendar', c) })
  }
  return itens.sort((a, b) => b.valor - a.valor)
}
/** Em jogo hoje = soma do que está na lista de Chamar hoje (inclui manutenções e sumidos). */
export const emJogoHoje = (s: State) => chamarHoje(s).reduce((t, i) => t + i.valor, 0)

// ---------- mensagens recebidas ----------
/** Mensagem chegando no WhatsApp. "Vim pelo site…" cria o contato com origem Site e etiqueta Novo. */
export function receberMensagem(s: State, nome: string, fone: string, texto: string): State {
  const d = hoje()
  let c = s.contacts.find(x => x.fone.replace(/\D/g, '') === fone.replace(/\D/g, ''))
  let contacts = s.contacts
  if (!c) {
    c = { id: uid(), nome, fone, tagId: T.novo, atentar: '', origem: /^\s*vim pelo site/i.test(texto) ? 'Site' : 'Outro' }
    contacts = [...contacts, c]
  }
  const cid = c.id
  return {
    ...s, contacts,
    msgs: [...s.msgs, { id: uid(), contactId: cid, dir: 'in', texto, ts: Date.now() }],
    envios: s.envios.some(e => e.contactId === cid && e.dia === d) || contacts !== s.contacts ? s.envios : [...s.envios, { contactId: cid, dia: d, motivo: 'respondeu' }],
    quotes: s.quotes.map(q => (q.contactId === cid ? { ...q, ultimoContato: d } : q)),
  }
}

// ---------- conversas reais (Evolution) ----------
export interface ConversaReal { fone: string; nome: string | null; foto: string | null; ts: number; ultima: { texto: string; deMim: boolean; ts: number } | null }
const so = (f: string) => f.replace(/\D/g, '')

/** Junta as conversas do WhatsApp com os contatos do painel. Quem é novo entra com etiqueta Novo
 *  (origem Site se escreveu "Vim pelo site…"); quem mandou mensagem nova conta como resposta. */
export function sincronizarConversas(s: State, conversas: ConversaReal[]): State {
  const d = hoje()
  let mudou = false
  let contacts = s.contacts, envios = s.envios, quotes = s.quotes
  for (const cv of conversas) {
    const i = contacts.findIndex(c => so(c.fone) === cv.fone)
    const atual = i >= 0 ? contacts[i] : null
    const u = cv.ultima
    if (!atual) {
      const site = !!u && !u.deMim && /^\s*vim pelo site/i.test(u.texto)
      contacts = [...contacts, { id: 'w' + cv.fone, nome: cv.nome || '+' + cv.fone, fone: '+' + cv.fone, tagId: T.novo, atentar: '', origem: site ? 'Site' : 'Outro', real: true, foto: cv.foto, ultima: u ?? undefined }]
      mudou = true
      continue
    }
    if (u && (!atual.ultima || u.ts > atual.ultima.ts || !atual.real)) {
      const respondeu = !u.deMim && (atual.ultima ? u.ts > atual.ultima.ts : Date.now() - u.ts < 86400000)
      contacts = contacts.map((c, j) => (j === i ? { ...c, real: true, foto: cv.foto ?? c.foto, ultima: u } : c))
      if (respondeu) {
        if (!envios.some(e => e.contactId === atual.id && e.dia === d && e.motivo === 'respondeu')) envios = [...envios, { contactId: atual.id, dia: d, motivo: 'respondeu' }]
        quotes = quotes.map(q => (q.contactId === atual.id ? { ...q, ultimoContato: d } : q))
      }
      mudou = true
    }
  }
  return mudou ? { ...s, contacts, envios, quotes } : s
}

// ---------- dados da demonstração ----------
export function seed(): State {
  const d = hoje()
  const ad = (n: number) => addDias(d, n)
  const tags: Tag[] = [
    { id: T.novo, nome: 'Novo', cor: '#1FA855', painel: false },
    { id: T.orc, nome: 'Orçamento enviado', cor: '#C07A1F', painel: true },
    { id: T.esp, nome: 'Esperando agendamento', cor: '#B44D72', painel: false },
    { id: T.trat, nome: 'Em tratamento (aparelho)', cor: '#2F7F72', painel: true },
    { id: T.cli, nome: 'Cliente', cor: '#8A6A24', painel: false },
    { id: T.nao, nome: 'Não é paciente', cor: '#8C8478', painel: false },
  ]
  const services: Service[] = [
    { id: S.aval, nome: 'Avaliação', preco: 100, duracao: 30, retorno: 0 },
    { id: S.limp, nome: 'Limpeza', preco: 200, duracao: 40, retorno: 180 },
    { id: S.rest, nome: 'Restauração', preco: 250, duracao: 40, retorno: 180 },
    { id: S.clc, nome: 'Clareamento caseiro', preco: 800, duracao: 30, retorno: 365 },
    { id: S.clo, nome: 'Clareamento em consultório', preco: 1200, duracao: 60, retorno: 365 },
    { id: S.inst, nome: 'Instalação de aparelho', preco: 1500, duracao: 60, retorno: 30 },
    { id: S.man, nome: 'Manutenção de aparelho', preco: 150, duracao: 20, retorno: 30 },
  ]
  const semana = '08:00-12:00,14:00-19:00'
  const profs: Professional[] = [
    { id: 'p1', nome: 'Dra. Elizabeth Cabral', cor: '#B8913F', horario: { 1: semana, 2: semana, 3: semana, 4: semana, 5: semana, 6: '08:00-12:00,13:00-16:00' } },
  ]
  const C = (id: string, nome: string, tagId: string | null, origem: Origem, atentar = '', manutencao?: number): Contact =>
    ({ id, nome, fone: `+55 96 9${String(8100 + Number(id.slice(1)) * 37).slice(0, 4)}-${String(1000 + Number(id.slice(1)) * 211).slice(0, 4)}`, tagId, atentar, origem, manutencao })
  const contacts: Contact[] = [
    C('c0', 'Mariana Souza', T.orc, 'Anúncio', 'Tem sensibilidade nos dentes'),
    C('c1', 'Juliana Lima', T.orc, 'Instagram', 'Só pode à tarde'),
    C('c2', 'Patrícia Alves', T.orc, 'Anúncio'),
    C('c3', 'Fernanda Rocha', T.orc, 'Site', 'Pediu parcelamento'),
    C('c4', 'Beatriz Costa', T.cli, 'Indicação'),
    C('c5', 'Aline Martins', T.orc, 'Anúncio'),
    C('c6', 'Amanda Teixeira', T.orc, 'Site', 'Vem com a mãe'),
    C('c7', 'Carla Mendes', T.trat, 'Anúncio', '', 30),
    C('c8', 'Renata Dias', T.trat, 'Instagram', 'Prefere o primeiro horário', 30),
    C('c9', 'Larissa Pires', T.trat, 'Anúncio', '', 30),
    C('c10', 'Tatiane Gomes', T.trat, 'Indicação', '', 30),
    C('c11', 'Gabriela Reis', T.esp, 'Site'),
    C('c12', 'Débora Nunes', T.novo, 'Site'),
    C('c13', 'Vanessa Freitas', T.novo, 'Anúncio'),
    C('c14', 'Camila Barros', T.cli, 'Indicação'),
    C('c15', 'Sofia Andrade', T.cli, 'Instagram'),
    C('c16', 'Priscila Ramos', T.trat, 'Anúncio', 'Tem medo de agulha', 30),
    C('c17', 'Helena Campos', T.cli, 'Site'),
    C('c18', 'Rosa Lima', T.nao, 'Anúncio'),
  ]
  const Q = (id: string, c: string, sv: string, coluna: Coluna, total: number, diasAtras: number, extra: Partial<Quote> = {}): Quote => ({
    id, contactId: c, serviceId: sv, coluna, total, fechado: coluna === 'fechou' ? total : 0, atentar: contacts.find(x => x.id === c)?.atentar ?? '',
    dataOrc: ad(-diasAtras - 3), ultimoContato: ad(-diasAtras), tentativas: 1, ...extra,
  })
  const quotes: Quote[] = [
    Q('q0', 'c0', S.clo, 'em_duvida', 1200, 5),
    Q('q1', 'c1', S.inst, 'em_duvida', 1500, 2),
    Q('q2', 'c2', S.rest, 'em_duvida', 750, 4, { tentativas: 2 }),
    Q('q3', 'c3', S.clc, 'em_duvida', 800, 1),
    Q('q4', 'c4', S.rest, 'fechou_parcial', 3200, 9, {
      etapas: [
        { id: 'e1', nome: 'Restaurações', valor: 500, situacao: 'feita' },
        { id: 'e2', nome: 'Clareamento', valor: 1200, situacao: 'pendente' },
        { id: 'e3', nome: 'Aparelho', valor: 1500, situacao: 'pendente' },
      ],
    }),
    Q('q5', 'c5', S.inst, 'para_organizar', 0, 0, { tentativas: 0 }),
    Q('q6', 'c6', S.clo, 'para_organizar', 0, 0, { tentativas: 0 }),
    Q('q7', 'c15', S.clo, 'fechou', 1200, 25, { concluidoEm: ad(-8), etapas: [{ id: 'e4', nome: 'Clareamento em consultório', valor: 1200, situacao: 'feita' }] }),
    Q('q8', 'c16', S.inst, 'fechou', 1500, 11, { recuperado: true, tentativas: 2 }),
    Q('q9', 'c17', S.rest, 'fechou', 500, 9, { recuperado: true, tentativas: 1 }),
    Q('q10', 'c18', S.clc, 'recusou', 800, 20),
  ]
  const procs: Proc[] = [
    { id: 'pr1', contactId: 'c7', serviceId: S.inst, data: ad(-75), valor: 1500 },
    { id: 'pr2', contactId: 'c7', serviceId: S.man, data: ad(-45), valor: 150 },
    { id: 'pr3', contactId: 'c8', serviceId: S.man, data: ad(-28), valor: 150 },
    { id: 'pr4', contactId: 'c9', serviceId: S.man, data: ad(-33), valor: 150 },
    { id: 'pr5', contactId: 'c10', serviceId: S.man, data: ad(-5), valor: 150 },
    { id: 'pr6', contactId: 'c16', serviceId: S.inst, data: ad(-10), valor: 1500 },
    { id: 'pr7', contactId: 'c14', serviceId: S.limp, data: ad(-200), valor: 200 },
    { id: 'pr8', contactId: 'c15', serviceId: S.clo, data: ad(-8), valor: 1200 },
  ]
  const appts: Appt[] = [
    { id: 'a1', contactId: 'c3', profId: 'p1', serviceId: S.aval, data: d, hora: '09:00', status: 'confirmado', confirmacao: 'confirmou' },
    { id: 'a2', contactId: 'c17', profId: 'p1', serviceId: S.rest, data: d, hora: '15:00', status: 'marcado' },
    { id: 'a3', contactId: 'c8', profId: 'p1', serviceId: S.man, data: ad(1), hora: '08:20', status: 'confirmado', confirmacao: 'confirmou' },
    { id: 'a4', contactId: 'c5', profId: 'p1', serviceId: S.aval, data: ad(1), hora: '14:00', status: 'marcado', confirmacao: 'remarcar' },
    { id: 'a5', contactId: 'c9', profId: 'p1', serviceId: S.man, data: ad(-3), hora: '10:00', status: 'faltou' },
    { id: 'a6', contactId: 'c10', profId: 'p1', serviceId: S.man, data: ad(-5), hora: '08:00', status: 'realizado' },
    { id: 'a7', contactId: 'c16', profId: 'p1', serviceId: S.inst, data: ad(-10), hora: '14:00', status: 'realizado' },
    { id: 'a8', contactId: 'c7', profId: 'p1', serviceId: S.man, data: ad(-45), hora: '16:00', status: 'realizado' },
    { id: 'a9', contactId: 'c8', profId: 'p1', serviceId: S.man, data: ad(-28), hora: '08:00', status: 'realizado' },
  ]
  const now = Date.now(); const H = 3600000
  const conv: [string, 'in' | 'out', string, number][] = [
    ['c0', 'in', 'Vim pelo anúncio. Quanto fica o clareamento em consultório?', 130], ['c0', 'out', 'Oi, Mariana! Fica R$ 1.200 e pode ser parcelado.', 129], ['c0', 'in', 'Vou pensar e te aviso', 128],
    ['c1', 'in', 'Oi! Queria saber do aparelho', 50], ['c1', 'out', 'Oi, Juliana! A instalação fica R$ 1.500. Posso te explicar como funciona.', 49],
    ['c2', 'in', 'Preciso restaurar três dentes, quanto fica?', 100], ['c2', 'out', 'Fica R$ 750 as três. Quer agendar?', 99],
    ['c3', 'in', 'Vim pelo site e tenho interesse em clareamento dental.', 26], ['c3', 'out', 'Oi, Fernanda! O caseiro fica R$ 800. Vamos marcar uma avaliação?', 25],
    ['c4', 'in', 'Amei como ficaram as restaurações!', 220],
    ['c5', 'in', 'Me passa o valor do aparelho?', 3],
    ['c6', 'in', 'Vim pelo site da OrtoClin.', 5],
    ['c7', 'in', 'Oi, esqueci de marcar a manutenção', 360],
    ['c8', 'in', 'Confirmado, até amanhã!', 4],
    ['c9', 'in', 'Desculpa, não consegui ir', 70],
    ['c10', 'in', 'Obrigada, Dra.!', 120],
    ['c11', 'in', 'Vim pelo site e gostaria de agendar uma avaliação.', 60],
    ['c12', 'in', 'Vim pelo site da OrtoClin e gostaria de agendar uma avaliação.', 1],
    ['c13', 'in', 'Boa tarde! Vi o anúncio de vocês', 0.5],
    ['c14', 'in', 'Obrigada pela limpeza!', 4800],
    ['c15', 'in', 'Meu sorriso ficou lindo ✨', 190],
    ['c16', 'in', 'Pode marcar então a instalação', 260],
    ['c17', 'in', 'Fechado, pode marcar', 215],
    ['c18', 'in', 'Agora não vou conseguir', 480],
  ]
  const msgs: Msg[] = conv.map(([cid, dir, texto, h], k) => ({ id: 'm' + k, contactId: cid, dir, texto, ts: now - h * H }))
  const envios: Envio[] = [
    { contactId: 'c16', dia: ad(-12), motivo: 'esfriou' }, { contactId: 'c16', dia: ad(-11), motivo: 'respondeu' },
    { contactId: 'c17', dia: ad(-10), motivo: 'retorno_dia2' }, { contactId: 'c17', dia: ad(-9), motivo: 'respondeu' },
    { contactId: 'c0', dia: ad(-5), motivo: 'esfriou' },
    { contactId: 'c2', dia: ad(-4), motivo: 'esfriou' },
    { contactId: 'c18', dia: ad(-20), motivo: 'esfriou' }, { contactId: 'c18', dia: ad(-20), motivo: 'respondeu' },
    { contactId: 'c8', dia: ad(-1), motivo: 'confirmacao' },
  ]
  const templates: Record<string, string> = {
    ideia_para_organizar: 'Oi, {nome}! Aqui é da OrtoClin. Posso te ajudar com {procedimento}?',
    ideia_em_duvida: 'Oi, {nome}! Aqui é da OrtoClin. Ficou alguma dúvida sobre {procedimento}? Fico à disposição para explicar com calma.',
    ideia_fechou: 'Que bom, {nome}! Seu tratamento está confirmado. Qualquer dúvida até lá, é só chamar.',
    ideia_fechou_parcial: 'Oi, {nome}! A primeira parte está certinha. Quando quiser, organizamos a próxima etapa, {etapa}.',
    ideia_recusou: 'Tudo bem, {nome}. Obrigada por considerar a OrtoClin. Estaremos por aqui quando precisar.',
    retorno_dia2: 'Oi, {nome}, tudo bem? Passando para saber se ficou alguma dúvida sobre {procedimento}.',
    esfriou: 'Oi, {nome}! Lembrei de você. Ainda tem interesse em {procedimento}? Temos horários nesta semana.',
    proxima_etapa: 'Oi, {nome}! Que tal marcarmos a próxima etapa, {etapa}?',
    manutencao_atrasada: 'Oi, {nome}! Está na hora da manutenção do seu aparelho. Qual dia fica melhor para você?',
    sumido: 'Oi, {nome}! Já faz um tempo desde a sua {procedimento}. Que tal agendar o retorno?',
    agendar: 'Oi, {nome}! Vamos encontrar um horário para você? Me diz qual dia fica melhor.',
    confirmacao_consulta: 'Oi, {nome}! Passando para confirmar sua consulta amanhã, {data}, às {hora}, com a {profissional}. Responda 1 para confirmar ou 2 para remarcar.',
    indicacao: 'Oi, {nome}! Foi um prazer cuidar do seu sorriso. Se conhecer alguém que precise de dentista, vamos adorar receber essa pessoa aqui na OrtoClin.',
  }
  return {
    clinica: { nome: 'OrtoClin', subtitulo: 'Odontologia Especializada', endereco: 'Av. Pres. Vargas, 42, Santa Rita, Macapá, AP, 68900-070', prazoEsfriar: 3, ativacao: ad(-24), confirmacaoVespera: false, horaConfirmacao: '18:00' },
    tags, services, profs, contacts, msgs, quotes, appts, procs, envios, templates,
    dia7: { parado: 21400, cards: 14, emDuvida: 9 },
  }
}
