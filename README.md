# 🚀 HERMES — Omnichannel Cash-Cow Content Factory

> Plataforma multi-tenant que gera, narra, renderiza e **publica automaticamente** vídeos curtos verticais no YouTube Shorts, TikTok e Instagram Reels.

---

## 📋 O que mudou nesta revisão

Esta seção existe porque a versão anterior **parecia funcionar e não funcionava**. Se você conhecia o projeto antes, comece por aqui.

### O problema central: a esteira era encenada

O `engine/worker.js` — justamente o processo que o README antigo mandava rodar — era um mock:

- Gravava a string literal `HEADER_MP4_HERMES_RENDERED` dentro do arquivo `.mp4`. Não havia vídeo.
- Marcava o job como `PUBLISHED` com o ID fixo `dQw4w9WgXcQ` (o rickroll) e montava uma URL de *busca* do YouTube.
- A dashboard repetia a encenação: o botão "Avançar Fase" escrevia esses mesmos dados falsos, e o Monitor de Produção injetava um job "publicado" fictício quando o Firestore dava erro — fazendo conexão quebrada parecer esteira saudável.

Existia, em paralelo, um motor real e bem escrito em `engine/src/` que **nada na dashboard chamava**. A correção foi unificar tudo nele e aposentar o resto.

### Bugs que impediam qualquer publicação real

| O que estava errado | Consequência |
|---|---|
| `fs-extra` ausente do `engine/package.json`, mas importado por 6 arquivos do motor | O motor real nem carregava |
| O modal de OAuth salvava o **código de autorização cru** no Firestore como se fosse conexão | Um code é de uso único e expira em minutos: nenhuma conta estava de fato conectada |
| TikTok e Instagram recebiam `file:///C:/...` como URL do vídeo | As duas APIs baixam o arquivo pela internet; falha garantida |
| `targetNetworks` nunca era preenchido por nada no código | TikTok e Instagram jamais seriam alvo, mesmo conectados |
| `renderEngine` adicionava vários clipes mas nunca concatenava | Só o primeiro clipe aparecia, e o mapeamento de áudio ficava ao acaso |
| Uploader do Instagram com `client_id: 'INSTAGRAM_APP_ID'` literal e `sleep(5s)` no lugar de polling | Reels levam 30–90 s para transcodificar: publicava antes da hora e falhava |
| O TikTok rotaciona o refresh token e invalida o anterior, e o novo não era salvo | O canal publicaria uma vez e quebraria na próxima |
| A rota de trigger executava o pipeline **e** o worker também reivindicava o job | Corrida com risco de renderizar e publicar o mesmo vídeo duas vezes |
| `state` do OAuth guardado em memória | Qualquer restart entre autorizar e voltar quebrava a conexão — e planos gratuitos reiniciam direto |
| Legendas com `Fontsize=22` em tela de 1080 px | Texto minúsculo, ilegível no celular |

### Segurança

- **Removida a rota `/api/vault/decrypt`**, que era pública, sem autenticação, e devolvia o texto claro de **qualquer** segredo armazenado.
- **CORS deixou de ser `*`** — só as origens configuradas.
- **A chave de API saiu do frontend.** O Vite embute todo `VITE_*` no bundle publicado, então num deploy público a chave era legível por qualquer visitante — e bastava para disparar produção e publicar nos seus canais. O acesso agora é por **Firebase Auth** com allowlist de operadores.

### Melhorias

- **Legendas sincronizadas de verdade:** o Edge TTS devolve marcação de tempo **por palavra**, e as legendas passaram a usar esses tempos reais em vez de durações estimadas.
- **Um clipe de fundo por seção** do roteiro, com concatenação real, então o visual muda ao longo do vídeo.
- **App próprio por canal** (ver [Conectando as redes](#-conectando-as-redes-sociais)) — é o que permite vários canais publicando em paralelo.
- **Preflight de ambiente**: detecta relógio fora de sincronia e chaves ausentes antes de gastar cota, transformando erros crípticos em mensagem clara.
- **Testes reais**: renderização com FFmpeg validada sem depender de rede nem de credenciais.
- **Logo**: recorte circular com máscara antisserrilhada, favicon multi-resolução. O `index.html` apontava para um `/favicon.svg` que não existia.
- Kwai foi removido: o endpoint usado não corresponde a uma API pública verificável, e um uploader que finge funcionar foi exatamente o problema que esta revisão veio corrigir.

### Arquivos aposentados

`engine/legacy/` guarda a primeira geração (scripts CLI, YouTube apenas, `tokens.json` global, fluxo OAuth `oob` que o Google desativou em 2022). **Nada ali é executado.**

---

## 🏗️ Como o sistema funciona

| Processo | Comando | Papel |
|---|---|---|
| **Engine (API)** | `npm run engine` | Recebe pedidos, faz o OAuth das redes, enfileira jobs |
| **Worker** | `npm run worker` | Executa a produção, um job por vez |
| **Dashboard** | `npm run dashboard` | Controle e monitoramento ao vivo |

O **Firestore é o barramento**: a dashboard só lê, o worker escreve o progresso, a dashboard reflete em tempo real.

Em hospedagem gratuita sem serviço de background worker, defina `ENABLE_WORKER=true` e a API roda a esteira no mesmo processo.

### Esteira de produção

```
QUEUED            na fila
  → SCRIPTING        roteiro escrito pelo Gemini (JSON estruturado)
  → AUDIO_GEN        locução neural Edge TTS + marcação de tempo por palavra
  → MEDIA_FETCH      um clipe vertical do Pexels por seção
  → VIDEO_RENDER     FFmpeg 1080x1920, concat dos clipes, legendas queimadas
  → READY_TO_UPLOAD  MP4 final em disco
  → UPLOADING        publicação nas redes conectadas
  → PUBLISHED        (ou FAILED, com a mensagem no documento do job)
```

---

## ⚙️ Configuração

### 1. Verifique o relógio do sistema

> **Antes de qualquer coisa.** O JWT da conta de serviço do Firebase e o token do Edge TTS são validados por horário no servidor. Com o relógio alguns minutos fora, o Firestore responde `16 UNAUTHENTICATED` e o Edge TTS responde `403` — erros que parecem credencial errada, mas são relógio errado.
>
> Windows: *Configurações → Hora e Idioma → Data e Hora → "Sincronizar agora"*.
>
> O `npm run worker` roda essa checagem sozinho e se recusa a iniciar com o relógio fora de sincronia.

### 2. Variáveis de ambiente

Copie `.env.example` para `.env` na raiz e `dashboard/.env.example` para `dashboard/.env`. Os arquivos estão comentados campo por campo.

> `ENCRYPTION_KEY` deriva a chave AES do cofre. **Se ela mudar, todas as credenciais salvas ficam ilegíveis** e as redes precisam ser reconectadas.

### 3. Operadores

O motor autentica por Firebase Auth:

1. Firebase Console → **Authentication** → ative **E-mail/senha** e crie seu usuário.
2. Coloque o mesmo e-mail em `ALLOWED_OPERATORS` no `.env` do motor.

`ALLOWED_OPERATORS` vazio significa **qualquer conta do projeto Firebase pode operar** — cômodo para uso solo. Nesse modo, desative a auto-inscrição em *Firebase Console → Authentication → Settings → User actions*, senão qualquer pessoa pode criar uma conta no projeto e entrar. O login continua obrigatório de qualquer forma.

### 4. Instalar e rodar

```bash
npm run install:all
```

Em três terminais:

```bash
npm run engine
```

```bash
npm run worker
```

```bash
npm run dashboard
```

---

## 🔌 Conectando as redes sociais

Há **duas camadas de credencial**, e confundi-las é a maior fonte de dúvida:

| | O que é | Quantas | Onde fica |
|---|---|---|---|
| **App** (`client_id` / `client_secret`) | Identifica o **Hermes** perante a plataforma. Não é uma conta. | Uma por app | `.env` (padrão) **ou** cofre do canal (app próprio) |
| **Conta** (`access_token` / `refresh_token`) | Identifica **cada canal conectado** | Uma por canal | Sempre no cofre do canal, criptografado |

Conectar 50 contas com um `client_id` só funciona — é assim que Buffer e Hootsuite operam. O `.env` não guarda contas.

### Por que dar um app próprio a cada canal

A cota da YouTube Data API é cobrada **por projeto do Google Cloud**, não por conta autorizada: 10.000 unidades/dia, 1.600 por upload.

- **Canais compartilhando um app** → ~6 vídeos/dia **somados entre todos**.
- **Cada canal com seu projeto** → ~6 vídeos/dia **por canal**.

Para vários canais produzindo em paralelo, o app próprio é o que destrava throughput. O mesmo vale para auditoria: o TikTok audita o *app*, e `instagram_content_publish` é aprovada por *app*.

Cadastre em **Gerenciador de Canais → (canal) → Conexões de Rede → App próprio deste canal**. Em branco, o canal cai no app do `.env`.

### Redirect URI

Cadastre no console de cada plataforma:

```
{ENGINE_PUBLIC_URL}/api/oauth/{rede}/callback
```

onde `{rede}` é `youtube`, `tiktok` ou `instagram`. **A mesma URI serve para todos os canais** — o motor distingue o canal pelo `state`, então não é preciso uma URI por canal.

Depois de trocar o app de um canal, **reconecte a conta**: o token antigo pertence ao app anterior e deixa de ser renovável.

### Exigências de cada plataforma

| Rede | Requisitos | Limite enquanto não aprovado |
|---|---|---|
| **YouTube** | Projeto no Google Cloud com YouTube Data API v3; tela OAuth "Externo" com seu e-mail em usuários de teste | Vídeos sobem como **privados** até passar pela verificação do Google. Cota: ~6 vídeos/dia por projeto |
| **TikTok** | App no TikTok for Developers com escopo `video.publish` | Sem auditoria de conteúdo, posts saem como **SELF_ONLY** |
| **Instagram** | Conta **Business ou Creator** vinculada a uma Página do Facebook; permissão `instagram_content_publish` aprovada | Conta pessoal **não publica** via API. Limite de 25 posts/24 h |

O envio ao TikTok usa `FILE_UPLOAD` em chunks, então **não precisa verificar domínio**. O Instagram baixa o vídeo por HTTPS — veja `PUBLIC_VIDEO_STRATEGY` abaixo.

Se um canal não define `targetNetworks`, o worker publica em **todas as redes conectadas** naquele canal.

### ⚠️ Modo de teste expira em 7 dias

No Google Cloud, um app com status de publicação **"Testing"** invalida o `refresh_token` a cada **7 dias**. O canal simplesmente para de publicar e você só percebe pelo silêncio — o oposto de autônomo. Para rodar sozinho, cada projeto precisa sair do modo de teste; como `youtube.upload` é escopo sensível, isso passa pela verificação do Google.

---

## ☁️ Deploy (tudo em plano gratuito)

| Peça | Onde | Plano |
|---|---|---|
| Dashboard | Vercel | Hobby (grátis) |
| Engine + Worker | Render | Free (Web Service) |
| Banco | Cloud Firestore | Spark (grátis) |
| IA | Gemini | Free tier |
| Clipes | Pexels | Grátis |
| Locução | Edge TTS | Grátis |

### Dashboard na Vercel

O `vercel.json` da raiz já builda `dashboard/` e serve como SPA. Configure em **Settings → Environment Variables** as variáveis `VITE_*` do `dashboard/.env.example`.

### Engine no Render

O `render.yaml` na raiz é um Blueprint pronto: **New → Blueprint**, aponte para o repositório, e preencha no painel as variáveis marcadas `sync: false`.

Depois do primeiro deploy, volte e ajuste:

- `ENGINE_PUBLIC_URL` → a URL real do serviço (ex.: `https://hermes-engine.onrender.com`)
- `DASHBOARD_URL` e `ALLOWED_ORIGINS` → a URL da dashboard na Vercel

**Três limites do plano free que importam:**

1. **O serviço hiberna após 15 min sem tráfego**, e hibernado ele não processa a fila. Mantenha-o acordado com um ping gratuito em `/health` a cada 10 min (cron-job.org ou UptimeRobot). O free oferece 750 h/mês e um mês tem ~730 h, então manter **um** serviço sempre ligado cabe na cota.
2. **Não existe Background Worker no free.** Por isso o Blueprint usa `ENABLE_WORKER=true`: a API roda a esteira no mesmo processo.
3. **O disco é efêmero** — os MP4 desaparecem em cada deploy. Como a publicação acontece dentro do mesmo job, isso não impede nada; só não conte com o histórico de arquivos locais.

### O vídeo público para o Instagram

O Instagram baixa o MP4 com os próprios servidores, então precisa de uma URL HTTPS alcançável. Duas estratégias, via `PUBLIC_VIDEO_STRATEGY`:

- **`engine` (padrão, gratuito)** — o motor serve o arquivo em `/public/videos/:jobId/:token`, com token imprevisível e expirável. Não custa nada porque o Render já termina HTTPS.
- **`storage`** — Firebase Cloud Storage com URL assinada. Mais robusto e sobrevive a restart, mas **Cloud Storage exige o plano Blaze (pago)** nos projetos Firebase atuais.

O TikTok não usa nenhuma das duas: recebe os bytes direto pelo `FILE_UPLOAD`.

### Agendamento automático

`n8n-configs/hermes_n8n_workflow.json` dispara `POST /api/jobs/trigger` periodicamente. Alternativa gratuita sem n8n: o mesmo cron externo que mantém o Render acordado pode chamar o trigger — mas a rota exige autenticação, então prefira o n8n (ou um Cloud Scheduler) que consiga enviar um token.

---

## 🗂️ Estrutura

```
hermes/
├── engine/
│   ├── src/
│   │   ├── config/          env, firebase, preflight
│   │   ├── middleware/      requireAuth (Firebase Auth)
│   │   ├── services/
│   │   │   ├── geminiService.js         roteiro estruturado
│   │   │   ├── ttsService.js            locução + marcação de tempo
│   │   │   ├── subtitleService.js       .ass com destaque por palavra
│   │   │   ├── mediaCollectorService.js clipes do Pexels
│   │   │   ├── renderEngine.js          FFmpeg 1080x1920
│   │   │   ├── publicVideoService.js    URL HTTPS do vídeo
│   │   │   ├── storageService.js        Firebase Storage (opcional)
│   │   │   ├── vaultService.js          AES-256-GCM
│   │   │   ├── oauthService.js          OAuth das 3 redes + app por canal
│   │   │   ├── pipelineOrchestrator.js  a esteira completa
│   │   │   └── uploaders/               youtube, tiktok, instagram
│   │   ├── worker/          productionWorker.js (fila)
│   │   └── server.js        API HTTP
│   ├── worker.js            entrypoint do worker separado
│   ├── test/
│   └── legacy/              primeira geração, não executada
├── dashboard/
│   ├── public/              logo circular e favicons
│   └── src/
│       ├── components/      LoginScreen, MonitorProducao, AppCredentialsPanel...
│       └── lib/             engineApi.js, jobStatus.js
├── render.yaml              Blueprint do motor
├── vercel.json              build da dashboard
└── n8n-configs/
```

---

## 🧪 Testes

```bash
npm test
```

Cobre criptografia do cofre, geração de legendas e **renderização real com FFmpeg** (1080x1920, áudio AAC, concat de clipes) sem precisar de rede nem credenciais. O teste que depende do Edge TTS é pulado automaticamente quando o relógio está fora de sincronia.

---

## 🔒 Segurança

- Tokens e chaves criptografados com AES-256-GCM no Firestore; nada em texto claro.
- Rotas de escrita exigem ID token do Firebase Auth, validado no servidor, restrito a `ALLOWED_OPERATORS`.
- CORS apenas para as origens configuradas.
- Não existe rota de descriptografia: segredos só são abertos dentro do motor.
- A rota pública de vídeo é protegida por token imprevisível com expiração, comparado em tempo constante.

---

## 📝 Licença

Software proprietário da fábrica de conteúdo **Hermes**. Todos os direitos reservados.
