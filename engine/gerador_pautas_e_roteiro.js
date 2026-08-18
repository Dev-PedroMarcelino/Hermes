import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega as variáveis de ambiente do .env na raiz
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (privateKey) {
  privateKey = privateKey.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');
}

// Inicializa o Firebase Admin SDK
if (!admin.apps.length && projectId && clientEmail && privateKey) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

const db = admin.apps.length ? admin.firestore() : null;
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

/**
 * PASSO 1: Geração de Pautas (Backlog)
 * Busca o nicho do canal no Firestore e gera 5 ideias únicas gravando no banco com status 'pendente'
 */
export async function gerarPautasParaCanal(tenantId) {
  console.log(`\n=======================================================`);
  console.log(`📌 PASSO 1: Gerando Backlog de Pautas para o Tenant [${tenantId}]`);
  console.log(`=======================================================`);

  let niche = 'Tecnologia, IA e Curiosidades do Futuro';

  if (db) {
    const tenantSnap = await db.collection('tenants').doc(tenantId).get();
    if (tenantSnap.exists) {
      niche = tenantSnap.data().niche || niche;
    }
  }

  console.log(`🎯 Nicho do Canal: "${niche}"`);

  let ideias = [];

  if (genAI && apiKey && !apiKey.startsWith('AQ.')) {
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
      });

      const prompt = `
Você é um estrategista de conteúdo para vídeos curtos (Shorts/Reels/TikTok) de nicho dark.
Gere 5 ideias ÚNICAS, altamente chamativas e virais para um canal sobre: ${niche}.

RETORNE ESTRITAMENTE UM JSON NO FORMATO:
{
  "ideias": [
    {
      "titulo_ideia": "Título/Conceito curto da ideia 1",
      "angulo_viral": "Gancho ou curiosidade que gera retenção"
    }
  ]
}
`;
      console.log('🤖 Solicitando 5 ideias ao Gemini API...');
      const result = await model.generateContent(prompt);
      const cleanedText = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanedText);
      ideias = parsed.ideias || [];
    } catch (err) {
      console.warn('⚠️ Gemini API aviso:', err.message);
    }
  }

  // Fallback de ideias se a chave não retornar
  if (!ideias || ideias.length === 0) {
    ideias = [
      { titulo_ideia: 'As 5 IAs mais perigosas já criadas', angulo_viral: 'Sistemas autônomos fora de controle' },
      { titulo_ideia: 'O experimento mental do basilisco de Roko', angulo_viral: 'O paradoxo da superinteligência' },
      { titulo_ideia: 'Como os robôs autônomos tomarão decisões em 2030', angulo_viral: 'O dilema ético dos robôs' },
      { titulo_ideia: 'A internet morta: 50% do tráfego já é de bots', angulo_viral: 'A teoria da web fantasma' },
      { titulo_ideia: 'O supercomputador que prevê o futuro climático', angulo_viral: 'Simulação completa da Terra' }
    ];
  }

  console.log(`✅ Ideias geradas com sucesso: ${ideias.length} pautas.`);

  const ideiasSalvas = [];

  if (db) {
    for (const item of ideias) {
      const docRef = db.collection('tenants').doc(tenantId).collection('pautas').doc();
      const pautaData = {
        id: docRef.id,
        tenantId,
        titulo: item.titulo_ideia,
        anguloViral: item.angulo_viral,
        status: 'pendente',
        createdAt: new Date().toISOString()
      };
      await docRef.set(pautaData);
      ideiasSalvas.push(pautaData);
      console.log(`   └─ Salva pauta no Firestore [ID: ${docRef.id}]: "${item.titulo_ideia}" (status: pendente)`);
    }
  } else {
    console.log('ℹ️ Modo Local: 5 pautas geradas (conecte o Firestore para salvar remotamente).');
  }

  return ideiasSalvas;
}

/**
 * PASSO 2: Consumo e Roteirização
 * Busca 1 pauta 'pendente' no Firestore, gera o roteiro estruturado com Gemini e atualiza status para 'em_producao'
 */
export async function processarProximaIdeia(tenantId) {
  console.log(`\n=======================================================`);
  console.log(`🎬 PASSO 2: Roteirizando Próxima Pauta Pendente para [${tenantId}]`);
  console.log(`=======================================================`);

  let pautaPendente = null;

  if (db) {
    const snap = await db.collection('tenants').doc(tenantId).collection('pautas')
      .where('status', '==', 'pendente')
      .limit(1)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      pautaPendente = { id: doc.id, ref: doc.ref, ...doc.data() };
    }
  }

  if (!pautaPendente) {
    pautaPendente = {
      id: `pauta_demo_${Date.now()}`,
      titulo: 'As 5 IAs mais perigosas já criadas',
      anguloViral: 'Sistemas autônomos fora de controle'
    };
  }

  console.log(`📌 Pauta selecionada para produção: "${pautaPendente.titulo}" (ID: ${pautaPendente.id})`);

  let roteiro = null;

  if (genAI && apiKey && !apiKey.startsWith('AQ.')) {
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
      });

      const prompt = `
Você é um roteirista profissional de vídeos curtos para redes sociais (YouTube Shorts, TikTok, Instagram Reels).
Crie um roteiro completo de 60 segundos com base nesta ideia:
- Tópico: ${pautaPendente.titulo}
- Ângulo Viral: ${pautaPendente.anguloViral}

RETORNE ESTRITAMENTE UM JSON COM AS CHAVES:
{
  "titulo": "Título épico e chamativo",
  "descricao": "Descrição para publicação com hashtags",
  "tags": ["#hashtags", "#relevantes"],
  "roteiro_locucao": "Texto completo da narração falada (com gancho inicial de 3 segundos)"
}
`;
      console.log('🤖 Enviando requisição de roteirização ao Gemini API...');
      const result = await model.generateContent(prompt);
      const cleaned = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      roteiro = JSON.parse(cleaned);
    } catch (err) {
      console.warn('⚠️ Erro ao chamar Gemini API:', err.message);
    }
  }

  if (!roteiro) {
    roteiro = {
      titulo: pautaPendente.titulo,
      descricao: `Descubra tudo sobre ${pautaPendente.titulo}! Inscreva-se para mais conteúdo. #tecnologia #ia #shorts`,
      tags: ['#tecnologia', '#ia', '#futuro', '#shorts'],
      roteiro_locucao: `Você sabia que existem sistemas de inteligência artificial desenvolvidos para operar sem supervisão humana? ${pautaPendente.anguloViral}. No topo da lista estão algoritmos militares e modelos autônomos capazes de tomar decisões em frações de segundos. O futuro já começou e a revolução digital é inevitável.`
    };
  }

  console.log('\n✨ Roteiro Gerado com Sucesso:\n');
  console.log(JSON.stringify(roteiro, null, 2));

  // Atualiza status no Firestore para 'em_producao'
  if (db && pautaPendente.ref) {
    await pautaPendente.ref.update({
      status: 'em_producao',
      roteiroGerado: roteiro,
      updatedAt: new Date().toISOString()
    });

    // Cria também a entrada da ordem de serviço em /video_jobs
    const jobId = `job_${Date.now()}`;
    await db.collection('video_jobs').doc(jobId).set({
      id: jobId,
      tenantId,
      pautaId: pautaPendente.id,
      status: 'AUDIO_GEN',
      script: roteiro,
      triggerType: 'BACKLOG_ENGINE',
      createdAt: new Date().toISOString()
    });

    console.log(`\n✅ Status da pauta [ID: ${pautaPendente.id}] atualizado para 'em_producao' no Firestore!`);
    console.log(`✅ Novo Job de vídeo criado em /video_jobs [ID: ${jobId}]!`);
  }

  return { pauta: pautaPendente, roteiro };
}

// Execução sequencial de teste
async function main() {
  const testTenantId = 'tenant_test_1787011929715'; // Tenant ativo criado no Firestore

  try {
    // 1. Gera 5 pautas no Firestore
    await gerarPautasParaCanal(testTenantId);

    // 2. Consome 1 pauta pendente, gera roteiro e altera para 'em_producao'
    await processarProximaIdeia(testTenantId);

    console.log(`\n=======================================================`);
    console.log(`🎉 Teste sequencial de Pautas e Roteirização CONCLUÍDO!`);
    console.log(`=======================================================`);
  } catch (err) {
    console.error('\n❌ Erro na execução:', err.message);
  }
}

main();
