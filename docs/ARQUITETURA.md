# Mirante — Arquitetura

> Avaliador de Engajamento e Comportamento Visual para gravações de reuniões.
> O Mirante registra **sinais visuais observáveis**. Ele não infere emoções, intenção,
> interesse, personalidade ou saúde mental, e não toma decisões sobre ninguém.

Este documento responde aos seis pontos pedidos antes da implementação.

---

## 1. Arquitetura e recursos

```
┌───────────────────────────── Next.js (Vercel ou Node) ─────────────────────────────┐
│  App Router · Server Components · Route Handlers (/api/*) · Tailwind v4 · Recharts │
│  Upload direto p/ Storage (URL assinada) · Dashboard · Timeline · Revisão · Admin  │
└───────────────┬───────────────────────────────────────────────┬────────────────────┘
                │ supabase-js (RLS, sessão do usuário)          │ cria jobs
┌───────────────▼───────────────────────────────────────────────▼────────────────────┐
│ Supabase                                                                           │
│  Postgres (RLS por organização) · Storage privado (recordings/, frames/)          │
│  Auth · RPC claim_job() com FOR UPDATE SKIP LOCKED · pg_cron opcional (retenção)  │
└───────────────▲────────────────────────────────────────────────────────────────────┘
                │ service role (só no servidor)
┌───────────────┴────────────────────────────────────────────────────────────────────┐
│ Worker de vídeo (Node + ffmpeg + sharp, Docker)  — escala horizontal              │
│  claim job → baixa vídeo → extrai frames → recorta SÓ regiões de não-hosts →       │
│  gating de movimento → folhas de contato por janela → IA multimodal (lotes) →     │
│  validação → consolidação temporal → grava ocorrências → gera relatório           │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Por que um worker separado: processar vídeo de 1 h leva minutos e precisa de ffmpeg.
Funções serverless têm limite de tempo e não trazem ffmpeg. O worker é um contêiner
simples (Railway, Fly.io, Render, ECS, uma VM) e roda quantas réplicas forem precisas:
o `claim_job()` garante que dois workers nunca pegam o mesmo job.

A lógica de análise (`src/lib/analysis/*`) é pura e sem dependências, compartilhada
entre o app e o worker, e coberta por testes.

## 2. Banco de dados

Multi-organização, com RLS em todas as tabelas. Perfis: `admin`, `analista`, `revisor`, `leitor`.

| Tabela | Papel |
|---|---|
| `organizations` | Configurações: confiança mínima, fps de amostragem, retenção, guardar frames, provedor/modelo de IA |
| `profiles` | Usuário ↔ organização + papel |
| `behavior_categories` | **Catálogo editável** de comportamentos (código, nome, grupo, descrição, critérios, confiança mínima própria, duração mínima, tolerância de junção, cor, ativo). `detection = 'visual'` vai para a IA; `'derivado'` é indicador calculado |
| `meetings` | Reunião, metadados do vídeo, status, progresso, snapshot das configurações usadas |
| `consent_records` | Registro de consentimento/transparência (obrigatório antes de processar) |
| `participants` | Participante por **posição no vídeo** (rótulo livre, nunca reconhecimento facial), `is_host` |
| `participant_regions` | Retângulo normalizado (0–1) de cada participante, com intervalo de validade (troca de layout) |
| `meeting_markers` | Marcos da apresentação ("00:12 — preço") para medir reações a acontecimentos |
| `processing_jobs` | Fila: `preview`, `analysis`, `report` |
| `analysis_windows` | Cada janela analisada: tokens, custo, resposta bruta, cobertura. Permite retomada idempotente |
| `occurrences` | Ocorrência consolidada: reunião, participante, categoria, descrição, início, fim, duração, confiança, frame de referência, status de revisão, categoria original (quando corrigida) |
| `reports` | Relatório versionado (JSON) |
| `audit_logs` | Quem viu/alterou/excluiu o quê |

Garantias no próprio banco:
- índice único parcial: **um host por reunião**;
- trigger `occurrences_block_host`: é impossível gravar ocorrência para o host, mesmo com service role;
- trigger `meetings_require_consent`: a reunião não entra na fila sem consentimento registrado.

## 3. Processamento de vídeo

Não enviamos o vídeo inteiro ao modelo. O pipeline:

1. **Pré-visualização** (job `preview`): ffprobe (duração, resolução, fps) e 6 frames
   distribuídos. O usuário usa esses frames para marcar as regiões.
2. **Extração**: `ffmpeg -vf fps=N,scale=1280:-2` (N padrão = 1 fps, configurável).
3. **Recorte**: para cada frame, recorta apenas as regiões de participantes **não-host**
   válidas naquele instante (sharp, máx. 384 px).
4. **Gating de movimento** (custo): cada recorte gera uma assinatura 16×16 em tons de cinza.
   - Recorte quase uniforme → *sem imagem* (câmera desligada): não chama IA, entra só na cobertura.
   - Janela sem mudança em relação à anterior → **propagação**: estende as ocorrências
     abertas da janela anterior sem nova chamada.
5. **Janelas temporais**: 8 s por janela (8 frames a 1 fps). Uma janela vira **uma folha de
   contato** (grade 4×2 com o horário de cada quadro). Uma imagem por chamada em vez de oito
   reduz tokens em ~5–7× e dá ao modelo a sequência, não um frame solto.
6. **Lotes e concorrência**: chamadas em paralelo com limite configurável (`AI_CONCURRENCY`),
   retry com backoff, e `analysis_windows` torna o job retomável (janela pronta não é refeita).
7. **Validação**: a resposta JSON é validada (códigos existentes no catálogo, índices de quadro
   válidos, confiança 0–1). O que não passa é descartado e registrado.
8. **Consolidação temporal** (`consolidate.ts`):
   - junta ocorrências da mesma categoria/participante separadas por até `merge_gap_ms`
     (inclusive entre janelas) — isso elimina duplicatas em frames consecutivos;
   - exige `min_frames` de suporte e `min_duration_ms` (ex.: "desviando o olhar
     frequentemente" precisa de persistência; "surpresa" pode ser breve);
   - confiança final = média ponderada pela duração; descarta abaixo do limiar
     (da categoria, ou da organização);
   - preserva ocorrências já revisadas por humanos ao reprocessar.
9. **Relatório**: métricas determinísticas + texto com linguagem controlada.

Estimativa de custo (1 h, 4 participantes não-host, 1 fps, 8 s/janela):
450 janelas × 4 = 1.800 chamadas no pior caso; com gating, tipicamente 40–60% disso.
Cada chamada ≈ 1 imagem 1536×384 + ~900 tokens de prompt. A tela de reunião mostra tokens
e custo real de cada análise (`analysis_windows`).

## 4. Exclusão do host

Três camadas independentes:

1. **Seleção manual obrigatória** antes de processar: o usuário desenha as regiões sobre um
   frame real e marca qual é o host. Sem host definido, o botão "Processar" fica bloqueado
   (há opção explícita "não há host visível no vídeo", ex.: só tela compartilhada).
2. **Os pixels do host nunca saem do servidor**: o worker só recorta regiões de não-hosts.
   O modelo nunca recebe o host — nem o quadro inteiro. A tela compartilhada também não é
   enviada.
3. **Barreira no banco**: trigger rejeita qualquer ocorrência com participante host.

Para layouts que mudam (alguém entra, troca para modo palestrante), regiões têm intervalo de
validade. Recomendação na UI: gravar em modo galeria.

## 5. Arquitetura da IA

- **Provedores plugáveis** (`provider.ts`): Anthropic (Claude), OpenAI e `mock`
  (determinístico, para desenvolvimento e testes sem custo). Escolha por organização.
- **Prompt gerado do catálogo**: cada categoria visual ativa entra com código, nome e
  critérios. Editar o catálogo muda a análise sem mexer em código.
- **Regras fixas no prompt**: descrever apenas o visível; nunca nomear emoções sentidas,
  intenção ou interesse; não identificar pessoas; responder só JSON.
- **Contexto temporal**: cada chamada recebe o estado ao fim da janela anterior do mesmo
  participante, para continuidade.
- **Guarda de linguagem** (`language-guard.ts`): toda descrição e todo texto do relatório
  passam por um filtro que bloqueia termos de diagnóstico ("entediado", "desinteressado",
  "mentindo", "ansioso"…). Descrição bloqueada é substituída pelo texto neutro da categoria.

## 6. Dashboard

- **Visão geral**: reuniões, participantes analisados, ocorrências, % revisadas, distribuição
  por categoria, tendência entre reuniões.
- **Reunião**: KPIs (duração, participantes, ocorrências, cobertura), distribuição, densidade
  por minuto, **timeline interativa** (uma faixa por participante, filtros por categoria e
  confiança, clique → vídeo pula para o trecho), lista cronológica no formato
  `00:02:15 | Participante 2 | Mexendo no celular`.
- **Participante**: frequência por categoria, momentos, tempo com atenção visual aparente.
- **Relatório**: principais comportamentos, mais recorrentes, picos de concentração,
  comparativo, reações perto dos marcos — com aviso fixo de uso.
- **Revisão**: confirmar, corrigir categoria/tempo, rejeitar, adicionar manual.
- **Admin**: catálogo, limiares, retenção, provedor de IA, usuários, auditoria.

## Privacidade e segurança

- Consentimento registrado por reunião (método, versão do aviso, quem atestou).
- Buckets privados; vídeo servido por URL assinada de 10 minutos.
- RLS por organização + papéis; service role só no servidor/worker.
- Retenção configurável: vídeo e frames apagados após N dias (`/api/cron/retention`), os
  resultados ficam; exclusão completa de reunião a qualquer momento.
- Sem reconhecimento facial; participantes são posições + rótulos livres.
- Sem inferência de emoção, saúde mental, personalidade ou intenção (prompt + filtro + UI).
- Sem decisões automáticas: nenhum score de pessoa, nenhum ranking "bom/ruim"; o relatório
  traz aviso explícito e as ocorrências passam por revisão humana.
- Auditoria de visualização de vídeo, alterações de revisão e exclusões.
- Atenção: análise de imagem de pessoas é tratamento de dado pessoal pela LGPD. Defina a
  base legal com o jurídico antes de usar com clientes.
