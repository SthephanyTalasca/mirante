# Mirante

Avaliador de Engajamento e Comportamento Visual para gravações de reuniões, apresentações comerciais,
treinamentos e demonstrações. Registra **sinais visuais observáveis** dos participantes ao longo do tempo,
**sempre excluindo o host**, com linha do tempo interativa, revisão humana e relatório.

> O Mirante não infere emoções, intenção, interesse, personalidade ou saúde mental, não usa reconhecimento
> facial e não toma decisões sobre pessoas. Veja `docs/ARQUITETURA.md`.

## Stack

- **Next.js 15** (App Router) + Tailwind v4 + Recharts: interface e rotas de API
- **Supabase**: Postgres com RLS, Auth, Storage privado, fila de jobs
- **Worker Node** (ffmpeg + sharp): extração de quadros, recorte, gating, chamadas à IA, consolidação
- **IA multimodal plugável**: Anthropic (Claude), OpenAI ou `mock` (sem custo, para testes)

## Estrutura

```
docs/ARQUITETURA.md          decisões: banco, processamento, exclusão do host, IA, dashboard, privacidade
supabase/migrations/         schema, RLS + storage, catálogo padrão, views e retenção
src/lib/analysis/            núcleo puro (sem dependências): prompt, validação, consolidação, métricas, relatório, guarda de linguagem
src/lib/server/              autenticação/permissões, carregamento de dados, relatório, retenção
src/app/api/                 rotas: reuniões, consentimento, participantes, processamento, revisão, catálogo, equipe, cron
src/app/(app)/               telas: painel, reuniões, nova análise, configurar participantes, dashboard da reunião, comportamentos, configurações
src/components/              timeline, editor de regiões, gráficos, relatório, revisão
worker/                      pipeline de vídeo e provedores de IA
tests/                       testes do núcleo e teste de ponta a ponta com vídeo real
```

## Como rodar

1. **Supabase**: crie um projeto e rode as migrations, em ordem:
   ```bash
   supabase link --project-ref <ref>
   supabase db push            # ou cole os 4 arquivos de supabase/migrations no SQL Editor
   ```
   Em *Authentication → URL Configuration*, adicione `http://localhost:3000/auth/callback`.

2. **Variáveis**: `cp .env.example .env.local` e preencha (Supabase, chave da IA, `CRON_SECRET`).

3. **App**:
   ```bash
   npm install
   npm run dev                 # http://localhost:3000
   ```
   Crie a conta: a primeira pessoa vira administradora e recebe o catálogo padrão de comportamentos.

4. **Worker** (precisa de ffmpeg no PATH):
   ```bash
   npm run worker
   # ou em produção:
   docker build -f Dockerfile.worker -t mirante-worker . && docker run --env-file .env.local mirante-worker
   ```
   Para testar sem custo, escolha o provedor **Simulado** em Configurações.

5. **Testes**:
   ```bash
   npm test                    # núcleo + pipeline (o teste de vídeo roda se /tmp/mtest/meeting.mp4 existir)
   npm run test:video          # gera o vídeo sintético e roda o teste de ponta a ponta
   ```

## Fluxo de uso

1. **Nova análise**: envie o vídeo e registre como os participantes foram informados (consentimento).
2. **Quem é quem**: sobre quadros reais do vídeo, desenhe a posição de cada pessoa (ou use "Grade" para modo galeria)
   e marque o host. Se o layout mudar, desenhe de novo num quadro posterior.
3. **Processar**: o worker analisa só os recortes dos não-hosts. A página mostra o progresso.
4. **Dashboard**: visão geral, linha do tempo com vídeo sincronizado, participantes e relatório.
5. **Revisão**: confirme, corrija ou rejeite ocorrências; adicione registros manuais e marcos
   (ex.: "apresentação do preço") para medir reações a acontecimentos. Atualize o relatório com as revisões.

## Implantação

- App: Vercel (o `vercel.json` agenda a retenção diária em `/api/cron/retention`).
- Worker: qualquer contêiner com saída para a internet (Railway, Fly.io, Render, ECS). Aumente réplicas
  para processar mais reuniões em paralelo; `AI_CONCURRENCY` controla chamadas simultâneas por réplica.

## O que foi verificado

- Testes do núcleo: guarda de linguagem, validação da resposta da IA, consolidação (junção entre janelas,
  quadros mínimos, duração mínima, limiar), exclusão do host, regiões com validade temporal, propagação, métricas e relatório.
- Teste de ponta a ponta com vídeo real 2×2 (ffmpeg + sharp + provedor simulado): nenhuma imagem enviada à IA contém
  pixels do host; câmera desligada não gera chamada; trechos estáticos são reaproveitados (7 chamadas para 15 janelas);
  olhar contínuo de 40 s vira **uma** ocorrência; descrição com termo emocional é neutralizada; reprocessar não repete chamadas.
- Migrations aplicadas num Postgres 16 local (`supabase/tests/`): cadastro cria organização + catálogo de 21 itens,
  convite entra com o papel certo, reunião não entra na fila sem consentimento, segundo host é recusado, ocorrência do
  host é recusada pelo banco, marcar alguém como host apaga as ocorrências dele, RLS isola organizações, fila não entrega
  o mesmo job duas vezes, retenção encontra vídeos vencidos.
- O código do app foi checado com o compilador TypeScript usando declarações simplificadas das bibliotecas (o ambiente
  de desenvolvimento não tinha acesso ao npm). Rode `npm run typecheck` e `npm run build` após o `npm install`.

## LGPD

Imagem de pessoas é dado pessoal. Antes de usar com clientes, defina com o jurídico a base legal, o texto do aviso
(versão em Configurações) e os prazos de retenção.
