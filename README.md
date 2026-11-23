# Painel da Cria · Demonstração

Demo para mostrar às clínicas como o painel funciona. Dados fictícios (Clínica Elizabeth, harmonização) e WhatsApp desligado.

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
- **Chamar hoje:** quem esfriou, retorno do dia 2, planos pela metade, sumidos e quem espera agendamento, com a mensagem pronta e o botão Enviar.
- **WhatsApp:** conversas com etiqueta ao lado do nome. Marcar "Orçamento enviado" cria o card no Painel. Há um botão "(demo) simular resposta" que tira a pessoa de Chamar hoje.
- **Painel:** arrastar entre colunas (ou "Mover para" no celular), valor, algo a se atentar e a ideia do que enviar.
- **Agenda:** dois profissionais, bloqueio de conflito e de horário fora do expediente, arrastar quem está "Esperando agendamento".
- **Sumidos, Resumo** (com PDF pela impressão do navegador) e **Ajustes** (só a dona).
- **Login:** "Entrar como dona" ou "Entrar como recepção" (a recepção não vê Ajustes). O login é de mentira, só para a demo.

Em Ajustes > Clínica, "Reiniciar demonstração" volta aos dados de exemplo.
