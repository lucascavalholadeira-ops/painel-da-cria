# OrtoClin · site + Painel da Cria

- `/` é o site da clínica (`index.html`, logos em `public/`).
- `/painel` é o painel (`painel/index.html` + `src/`).

Instalação da **OrtoClin, Odontologia Especializada** (Macapá, AP). Visual claro e dourado, igual ao site da clínica.
Em modo demonstração (padrão) usa pacientes fictícios e não mostra avisos de WhatsApp. Para usar com dados reais, defina `VITE_DEMO=false`.

## Rodar
```bash
npm install
npm run dev
```

## Publicar na Vercel
Importe o repositório na Vercel (detecta Vite sozinho). Nenhuma variável é obrigatória.

## WhatsApp (Evolution API)
Na Vercel, em Settings > Environment Variables, adicione:

| Variável | Exemplo |
|---|---|
| `EVOLUTION_API_URL` | `https://sua-evolution.exemplo.com` |
| `EVOLUTION_API_KEY` | chave da Evolution |
| `EVOLUTION_INSTANCE` | `painel-da-cria-demo` (uma por clínica) |

A chave fica só na função de servidor `api/evolution.ts` e nunca vai para o navegador. A função só mexe na instância de `EVOLUTION_INSTANCE`.

- **Login:** "Entrar com WhatsApp" mostra o QR code; quando o celular conecta, entra como dona.
- **Ajustes > WhatsApp:** status, número conectado, QR para reconectar e botão para desconectar.
- **Faixa vermelha no topo** quando o WhatsApp cai.

Localmente, `npm run dev` já roda a função (lê o `.env`).

## Supabase (opcional)
1. Crie um projeto no Supabase e rode `supabase/schema.sql` no SQL Editor.
2. Na Vercel, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

Com isso, as mudanças feitas na demo ficam salvas no Supabase. Sem isso, ficam no navegador de quem está usando.

## O que dá para mostrar
- **Chamar hoje:** "Em jogo hoje" (soma da lista) separado do "Parado" do topo. Lista: manutenção do aparelho atrasada, próxima etapa do plano pelo nome, orçamentos que esfriaram, retorno do dia 2, sumidos, pedido de indicação 7 dias depois do tratamento concluído e quem espera agendamento.
- **WhatsApp:** etiqueta ao lado do nome (Novo, Orçamento enviado, Esperando agendamento, Em tratamento (aparelho), Cliente, Não é paciente). Mensagem que começa com "Vim pelo site" cria o contato com origem Site e etiqueta Novo. Há um botão de demonstração que simula isso.
- **Painel:** arrastar entre colunas; em "Fechou parte", plano com etapas (feita, agendada, pendente) e o "falta" calculado pelas pendentes.
- **Agenda:** horário da clínica (seg a sex 8h–12h e 14h–19h; sáb 8h–12h e 13h–16h), bloqueio de conflito e de horário fechado, confirmação na véspera (desligada por padrão, em Ajustes > Agenda) e a aba **Manutenções do aparelho**.
- **Agendar** a partir de Chamar hoje, do card do Painel, da conversa e de Sumidos: abre a Agenda com paciente, serviço e o primeiro horário livre.
- **Resumo:** parado no dia 7 contra hoje, chamadas, respostas, recuperado, manutenções e comparecimento, origem dos pacientes.

Em Ajustes > Clínica, "Reiniciar demonstração" volta aos dados de exemplo.
