# 🚀 HERMES - OMNICHANNEL CASH-COW CONTENT FACTORY (V1.0)

> **Plataforma SaaS Multi-Tenant autônoma para geração, roteirização, síntese de voz, renderização física e publicação de vídeos curtos virais no YouTube Shorts, TikTok e Instagram Reels.**

---

## 📌 Visão Geral e Objetivos do Projeto

O **Hermes** foi construído como uma fábrica de conteúdo autônoma focada no modelo de negócios **Cash Cow** (canais automatizados focados em alta retenção e monetização). 

A plataforma resolve o gargalo de produção em massa de vídeos curtos através de uma esteira *end-to-end* operada por Inteligência Artificial e automação nativa:

1. **Geração Inédita de Roteiros (Gemini 1.5 Flash)** com memória anti-duplicação.
2. **Locução Neural & Legendas (EdgeTTS + WebVTT)** com vozes de estúdio em português.
3. **Renderização de Vídeo Vertical 9:16 (FFmpeg)** com legendas queimadas (*hardsubs*).
4. **Upload Real Multi-Tenant (YouTube Data API v3)** direto no canal do cliente via OAuth2.
5. **Sala de Controle & Dashboard (React + Vite)** com monitoramento ao vivo em tempo real.

---

## ✨ Principais Funcionalidades

### 🧠 1. Sistema Anti-Repetição (Memória de Contexto)
- Antes de gerar novas pautas, o motor consulta o histórico das últimas 20 pautas gravadas no Cloud Firestore para aquele canal específico.
- Injeta a lista de exlusão no prompt do Google Gemini exigindo temas 100% inéditos e sem duplicação de ideias.

### 🎬 2. Motor de Minisséries & Cliffhangers Virais
- Permite transformar qualquer tema em uma **Minissérie em Partes Encadeadas** (2, 3 ou 5 partes).
- Cada parte é gerada com um **gancho nos primeiros 3 segundos** e encerra obrigatoriamente com um *cliffhanger* dramático convidando o público a assistir o próximo episódio.

### 🔊 3. Locução Neural & Legendas Sincronizadas
- Utiliza a tecnologia **EdgeTTS** (`pt-BR-AntonioNeural`, `pt-BR-FranciscaNeural`, etc.) para criar o arquivo de áudio de alta qualidade `.mp3` no disco (`output/audios/`).
- Sincroniza e exporta o arquivo de legendas `.vtt` (`output/subtitles/`).

### 🎥 4. Renderização Física de Vídeo (FFmpeg + fluent-ffmpeg)
- Processa o vídeo final em resolução vertical 1080x1920 (9:16) adequado para Shorts/TikTok.
- Mescla o áudio de narração, ajusta a duração exata (`-shortest`) e queima as legendas centralizadas na tela.

### 🌐 5. Conexão OAuth2 Multi-Tenant por Canal
- Cada canal cadastrado possui sua própria área de **Conexões de Rede**.
- Permite autenticar via OAuth2 oficial do Google/YouTube, armazenando com segurança os tokens (`access_token`, `refresh_token`) no documento do canal no Firestore.

### 📊 6. Dashboard Cyberpunk Tech (React + Vite)
- **Sala de Controle dos Canais**: Gerenciamento de prompts da IA, tom de voz e frequência de postagens.
- **Monitor de Produção em 2 Colunas**:
  - **Coluna Esquerda**: Galeria de vídeos publicados com **Player do YouTube Incorporado (`<iframe>`)** para assistir diretamente na Dashboard.
  - **Coluna Direita**: Esteira de produção com **Barra de Progresso e Porcentagem em Tempo Real** (25%, 50%, 75%, 100%).
- **Botão `+ Criar Novo Vídeo`**: Modal de disparo instantâneo por assunto e orientação direta para a IA.

### 🗑️ 7. Exclusão em Cascata (Vídeos & Canais)
- Apaga registros do Firestore, exclui os arquivos físicos locais (`.mp4`, `.mp3`, `.vtt`) e remove o vídeo diretamente do YouTube real via API se já estiver publicado.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: React 18, Vite, Lucide React (Iconografia em Linhas Minimalistas), Vanilla CSS Cyberpunk (`#00ff87` Neon Green).
- **Backend / Engine**: Node.js (ES Modules), Express.
- **Banco de Dados & Cloud**: Firebase Admin SDK, Cloud Firestore (Multi-Tenant Schema).
- **Inteligência Artificial**: Google Generative AI (`@google/generative-ai` - Gemini 1.5 Flash).
- **Processamento de Mídia**: `node-edge-tts`, `fluent-ffmpeg`, `ffmpeg-static`.
- **APIs de Terceiros**: `googleapis` (YouTube Data API v3 & OAuth2).

---

## 📁 Estrutura de Pastas do Projeto

```
hermes/
├── dashboard/                   # Aplicação Web Frontend (React + Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChannelDetailModal.jsx
│   │   │   ├── CriarPautaManual.jsx
│   │   │   ├── CriarVideoQuickModal.jsx
│   │   │   ├── GerenciadorCanais.jsx
│   │   │   ├── MonitorProducao.jsx
│   │   │   └── OAuthConnectionModal.jsx
│   │   ├── App.jsx
│   │   ├── firebase.js
│   │   └── index.css
│   ├── package.json
│   └── vercel.json              # Regras de SPA e Deploy Vercel
├── engine/                      # Motor autônomo backend em Node.js
│   ├── gerador_pautas_e_roteiro.js
│   ├── gerador_audio.js
│   ├── gerador_video.js
│   ├── upload_youtube.js
│   ├── worker.js                # Daemon de esteira em tempo real
│   └── src/services/
│       ├── deleteService.js
│       └── oauthService.js
├── output/                      # Diretório físico de saída dos arquivos
│   ├── audios/                  # Arquivos .mp3
│   ├── subtitles/               # Arquivos .vtt
│   └── videos/                  # Arquivos .mp4
├── .env                         # Variáveis de ambiente secretas
├── package.json
└── README.md
```

---

## ⚙️ Como Configurar e Executar

### 1. Pré-requisitos
- Node.js v18 ou superior instalado.
- Chave de API do **Google Gemini** (`GEMINI_API_KEY`).
- Credenciais da conta de serviço do **Firebase Admin** (`serviceAccountKey.json` ou variáveis no `.env`).

### 2. Variáveis de Ambiente (`.env` na raiz)
Crie um arquivo `.env` na raiz do projeto `hermes`:

```env
FIREBASE_PROJECT_ID=hermes-ca93c
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@hermes-ca93c.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

GEMINI_API_KEY=sua_chave_gemini_aqui
YOUTUBE_CLIENT_ID=seu_client_id_google.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=seu_client_secret_google
```

### 3. Instalar Dependências
```bash
# Na raiz do projeto
npm install

# Na pasta da dashboard
cd dashboard && npm install
```

### 4. Executar a Dashboard de Controle (Localhost)
```bash
cd dashboard
npm run dev
```
Acesse em: `http://localhost:5173`.

### 5. Executar o Worker Autônomo da Esteira
Em um segundo terminal na raiz do projeto:
```bash
node engine/worker.js
```

---

## 📝 Licença

Este projeto é um software proprietário desenvolvido para a fábrica de conteúdo autônoma **Hermes**. Todos os direitos reservados.
