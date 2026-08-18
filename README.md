# 🚀 HERMES — Omnichannel Cash-Cow Content Factory

> Plataforma multi-tenant para gerar, narrar, renderizar e **publicar automaticamente** vídeos curtos verticais no YouTube Shorts, TikTok e Instagram Reels.

---

## 📌 Como o sistema funciona

Três processos independentes:

| Processo | Comando | Papel |
|---|---|---|
| **Engine (API)** | `npm run engine` | Recebe pedidos da dashboard, faz o OAuth das redes, enfileira jobs |
| **Worker** | `npm run worker` | Executa a produção de verdade, um job por vez |
| **Dashboard** | `npm run dashboard` | Interface de controle e monitoramento em tempo real |

O **Firestore é o barramento** entre eles: a dashboard só lê, o worker escreve o progresso, e a dashboard reflete ao vivo.

### Esteira de produção (executada pelo worker)

```
QUEUED
  → SCRIPTING        roteiro escrito pelo Gemini (JSON estruturado)
  → AUDIO_GEN        locução neural Edge TTS + marcações de tempo por palavra
  → MEDIA_FETCH      clipes verticais de fundo do Pexels (um por seção)
  → VIDEO_RENDER     FFmpeg 1080x1920, concat dos clipes, legendas queimadas
  → READY_TO_UPLOAD  MP4 final em output/videos/
  → UPLOADING        publicação nas redes conectadas
  → PUBLISHED        (ou FAILED, com a mensagem de erro no documento do job)
```

As legendas usam as **marcações reais de tempo** devolvidas pelo Edge TTS, então a palavra destacada acompanha exatamente a voz.

---

## ⚙️ Configuração

### 1. Pré-requisitos

- Node.js 18+
- Projeto no Firebase com Firestore e Storage habilitados
- Chave da API do Google Gemini
- Chave da API do Pexels (opcional — sem ela o vídeo sai com fundo sólido)

### 2. Relógio do sistema

> **Verifique isto antes de qualquer coisa.** O JWT da conta de serviço do Firebase e o token do Edge TTS são validados por horário no servidor. Se o relógio da máquina estiver alguns minutos fora, o Firestore responde `16 UNAUTHENTICATED` e o Edge TTS responde `403` — erros que parecem credencial errada, mas são relógio errado.
>
> Windows: *Configurações → Hora e Idioma → Data e Hora → "Sincronizar agora"*.
>
> O `npm run worker` roda essa verificação sozinho e se recusa a iniciar com o relógio fora de sincronia.

### 3. Variáveis de ambiente

Copie `.env.example` para `.env` na raiz e preencha:

```env
PORT=3001
ENCRYPTION_KEY=<string aleatória de 32+ caracteres>
ENGINE_API_KEY=<segredo compartilhado com a dashboard>
ALLOWED_ORIGINS=http://localhost:3000
ENGINE_PUBLIC_URL=http://localhost:3001
DASHBOARD_URL=http://localhost:3000

GEMINI_API_KEY=
PEXELS_API_KEY=

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
FIREBASE_STORAGE_BUCKET=

# App padrão do sistema — opcional. Serve de fallback para canais que ainda
# não cadastraram o próprio app. Veja "Conectando as redes sociais".
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
```

E `dashboard/.env` (veja `dashboard/.env.example`):

```env
VITE_ENGINE_URL=http://localhost:3001
VITE_ENGINE_API_KEY=<mesmo valor de ENGINE_API_KEY>
VITE_FIREBASE_API_KEY=...
```

> `ENCRYPTION_KEY` deriva a chave AES do cofre. **Se ela mudar, todas as credenciais salvas ficam ilegíveis** e as redes precisam ser reconectadas.

### 4. Instalar e rodar

```bash
npm run install:all
```

Depois, três terminais:

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

Existem **duas camadas de credencial**, e confundi-las é a maior fonte de dúvida:

| | O que é | Quantas | Onde fica |
|---|---|---|---|
| **App** (`client_id` / `client_secret`) | Identifica o **Hermes** perante a plataforma. Não é uma conta. | Uma por app | `.env` (padrão) **ou** cofre do canal (app próprio) |
| **Conta** (`access_token` / `refresh_token`) | Identifica **cada canal conectado** | Uma por canal | Sempre no cofre do canal, criptografado |

Conectar 50 contas com um `client_id` só funciona — é assim que Buffer e Hootsuite operam. O `.env` não guarda contas.

### Por que dar um app próprio a cada canal

A cota da YouTube Data API é cobrada **por projeto do Google Cloud**, não por conta autorizada: 10.000 unidades/dia, 1.600 por upload. Ou seja:

- **Canais compartilhando um app** → ~6 vídeos/dia **somados entre todos**.
- **Cada canal com seu projeto** → ~6 vídeos/dia **por canal**.

Para vários canais produzindo em paralelo, o app próprio é o que destrava throughput. O mesmo vale para auditoria: o TikTok audita o *app*, e a permissão `instagram_content_publish` é aprovada por *app*.

Cadastre em **Gerenciador de Canais → (canal) → Conexões de Rede → App próprio deste canal**. Deixando em branco, o canal cai no app do `.env`.

### Redirect URI

No console de cada plataforma, cadastre:

```
http://localhost:3001/api/oauth/{rede}/callback
```

onde `{rede}` é `youtube`, `tiktok` ou `instagram`. **A mesma URI serve para todos os canais** — o engine distingue o canal pelo parâmetro `state`, então você não precisa de uma URI por canal.

Depois de trocar o app de um canal, **reconecte a conta**: o token antigo pertence ao app anterior e deixa de ser renovável.

### ⚠️ Modo de teste expira em 7 dias

No Google Cloud, um app com status de publicação **"Testing"** invalida o `refresh_token` a cada **7 dias** — o que quebra a operação autônoma, porque o canal para de publicar até você reconectar na mão. Para rodar sozinho de verdade, cada projeto precisa sair do modo de teste. Como o escopo `youtube.upload` é sensível, isso passa pela verificação do Google.

### O que cada plataforma exige

| Rede | Requisitos | Limite enquanto não aprovado |
|---|---|---|
| **YouTube** | Projeto no Google Cloud com YouTube Data API v3; tela OAuth "Externo" com seu e-mail em usuários de teste | Vídeos sobem como **privados** até o app passar pela verificação do Google. Cota: 10.000 unidades/dia, 1.600 por upload (**~6 vídeos/dia**) |
| **TikTok** | App no TikTok for Developers com escopo `video.publish` | Sem auditoria de conteúdo, posts saem como **SELF_ONLY** (privados) |
| **Instagram** | Conta **Business ou Creator** vinculada a uma Página do Facebook; permissão `instagram_content_publish` aprovada | Conta pessoal **não publica** via API. Limite de 25 posts/24h |

O envio ao TikTok usa `FILE_UPLOAD` em chunks, então **não é preciso verificar domínio**. O Instagram baixa o vídeo por HTTPS, então o MP4 é publicado no Firebase Storage com URL assinada antes de publicar.

Se um canal não define `targetNetworks`, o worker publica em **todas as redes que estiverem conectadas** naquele canal.

---

## 🗂️ Estrutura

```
hermes/
├── engine/
│   ├── src/
│   │   ├── config/          env, firebase, preflight (checagem de relógio/chaves)
│   │   ├── services/
│   │   │   ├── geminiService.js         roteiro estruturado
│   │   │   ├── ttsService.js            locução + marcações de tempo
│   │   │   ├── subtitleService.js       .ass com destaque por palavra
│   │   │   ├── mediaCollectorService.js clipes do Pexels
│   │   │   ├── renderEngine.js          FFmpeg 1080x1920
│   │   │   ├── storageService.js        upload + URL assinada
│   │   │   ├── vaultService.js          AES-256-GCM
│   │   │   ├── oauthService.js          troca code→token das 3 redes
│   │   │   ├── pipelineOrchestrator.js  a esteira completa
│   │   │   └── uploaders/               youtube, tiktok, instagram
│   │   └── server.js        API HTTP
│   ├── worker.js            daemon da esteira
│   ├── test/                testes (render offline não precisa de rede)
│   └── legacy/              primeira geração, não executada
├── dashboard/
│   └── src/
│       ├── components/
│       └── lib/             engineApi.js, jobStatus.js
├── n8n-configs/             agendamento opcional via n8n
└── output/                  MP4 renderizados
```

---

## 🧪 Testes

```bash
npm test
```

Cobre criptografia do cofre, geração de legendas e **renderização real com FFmpeg** (sem rede). O teste que depende do Edge TTS é pulado automaticamente quando o relógio está fora de sincronia.

---

## 🔒 Segurança

- Tokens e chaves ficam criptografados (AES-256-GCM) no Firestore; nada trafega em claro.
- As rotas de escrita exigem o header `x-api-key`.
- O CORS aceita apenas as origens em `ALLOWED_ORIGINS`.
- Não existe rota de descriptografia: os segredos só são abertos dentro do worker.

---

## 📝 Licença

Software proprietário da fábrica de conteúdo **Hermes**. Todos os direitos reservados.
