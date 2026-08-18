import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

if (!admin.apps.length && projectId && clientEmail && privateKey) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

const db = admin.apps.length ? admin.firestore() : null;

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('❌ ERRO: GEMINI_API_KEY não foi encontrada no arquivo .env!');
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const model = genAI ? genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }) : null;

export async function gerarPautasParaCanal(tenantId = 'tenant_test_1787011929715') {
  console.log('=======================================================');
  console.log(`📌 PASSO 1: Gerando Backlog de Pautas para o Tenant [${tenantId}]`);
  console.log('=======================================================');

  let nicho = 'Tecnologia, IA e Futuro';
  let customPrompt = 'Crie roteiros dinâmicos e envolventes com ganchos virais nos primeiros 3 segundos.';

  if (db) {
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (tenantDoc.exists) {
      const data = tenantDoc.data();
      nicho = data.niche || data.nicho || nicho;
      customPrompt = data.aiPrompt || customPrompt;
    }
  }

  console.log(`🎯 Nicho do Canal: "${nicho}"`);
  console.log(`🤖 Prompt de Orientação da IA: "${customPrompt}"`);

  let pautasArray = [
    { titulo: 'O supercomputador que prevê o futuro climático', conceito: 'Como IA de simulação antecipa catástrofes em segundos.' },
    { titulo: 'As 5 IAs mais perigosas já criadas', conceito: 'Modelos autônomos restritos por governos.' },
    { titulo: 'O mistério dos servidores quânticos escondidos', conceito: 'A corrida tecnológica global sigilosa.' },
    { titulo: 'Como algoritmos prevêem decisões humanas', conceito: 'O viés cognitivo capturado por redes neurais.' },
    { titulo: 'A revolução dos chips biológicos', conceito: 'Computadores alimentados por células orgânicas.' }
  ];

  if (model) {
    try {
      const prompt = `Você é um diretor de conteúdo de vídeos curtos.
      Regras da IA do Canal: "${customPrompt}".
      Gere exatamente 5 ideias únicas de vídeos virais de 60 segundos sobre o nicho: "${nicho}".
      Retorne ESTREITAMENTE um JSON no seguinte formato array:
      [
        { "titulo": "Título Curto", "conceito": "Resumo em 1 frase" }
      ]`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const cleanedJson = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      pautasArray = JSON.parse(cleanedJson);
    } catch (e) {
      console.warn('⚠️ Nota na API Gemini. Usando pautas estruturadas de fallback:', e.message);
    }
  }

  if (db) {
    console.log(`\n💾 Salvando 5 pautas no Cloud Firestore com status "pendente"...`);
    const batch = db.batch();
    const pautasRef = db.collection('tenants').doc(tenantId).collection('pautas');

    for (const pauta of pautasArray) {
      const newDoc = pautasRef.doc();
      batch.set(newDoc, {
        titulo: pauta.titulo,
        conceito: pauta.conceito,
        status: 'pendente',
        createdAt: new Date().toISOString()
      });
    }

    await batch.commit();
    console.log('✅ 5 Pautas salvas com SUCESSO no Firestore!');
  }
}

export async function processarProximaIdeia(tenantId = 'tenant_test_1787011929715') {
  console.log('\n=======================================================');
  console.log(`📌 PASSO 2: Consumo e Roteirização Gemini para Tenant [${tenantId}]`);
  console.log('=======================================================');

  let ideaDoc = null;
  let customPrompt = 'Atue como um roteirista sênior de vídeos curtos.';

  if (db) {
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (tenantDoc.exists) {
      customPrompt = tenantDoc.data().aiPrompt || customPrompt;
    }

    const pautasSnap = await db.collection('tenants').doc(tenantId).collection('pautas')
      .where('status', '==', 'pendente')
      .limit(1)
      .get();

    if (!pautasSnap.empty) {
      const doc = pautasSnap.docs[0];
      ideaDoc = { id: doc.id, ref: doc.ref, ...doc.data() };
    }
  }

  if (!ideaDoc) {
    const testId = `pauta_${Date.now()}`;
    ideaDoc = {
      id: testId,
      titulo: 'O supercomputador que prevê o futuro climático',
      conceito: 'Como IA de simulação antecipa catástrofes em segundos.'
    };
  }

  console.log(`📌 Ideia Selecionada: "${ideaDoc.titulo}" [ID: ${ideaDoc.id}]`);

  let roteiroFinal = {
    titulo: ideaDoc.titulo,
    descricao: 'Vídeo gerado automaticamente sobre inovação e ciência.',
    tags: ['#ia', '#futuro', '#tecnologia', '#shorts'],
    roteiro_locucao: 'Você sabia que existem sistemas de inteligência artificial desenvolvidos para operar sem supervisão humana? No topo da lista estão algoritmos militares e modelos autônomos capazes de tomar decisões em frações de segundos. O futuro já começou e a revolução digital é inevitável.'
  };

  if (model) {
    try {
      const prompt = `Atue como roteirista sênior de vídeos curtos (Shorts/Reels/TikTok).
      Regras e Tom de Voz do Canal: "${customPrompt}".
      Escreva o roteiro completo de narração de 60 segundos para o vídeo: "${ideaDoc.titulo}".
      
      Retorne ESTREITAMENTE um objeto JSON válido sem textos ao redor:
      {
        "titulo": "${ideaDoc.titulo} #Shorts",
        "descricao": "Descrição engajadora...",
        "tags": ["#tag1", "#tag2", "#tag3"],
        "roteiro_locucao": "Texto completo da narração em português..."
      }`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const cleanedJson = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      roteiroFinal = JSON.parse(cleanedJson);
    } catch (e) {
      console.warn('⚠️ Usando roteiro estruturado fallback:', e.message);
    }
  }

  if (db && ideaDoc.ref) {
    await ideaDoc.ref.update({ status: 'em_producao', updatedAt: new Date().toISOString() });
  }

  let jobId = `job_${Date.now()}`;
  if (db) {
    const jobRef = db.collection('video_jobs').doc(jobId);
    await jobRef.set({
      tenantId,
      pautaId: ideaDoc.id,
      status: 'AUDIO_GEN',
      script: roteiroFinal,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    console.log(`✅ Novo Job de Vídeo [${jobId}] criado em /video_jobs com status 'AUDIO_GEN'!`);
  }

  return { jobId, roteiro: roteiroFinal };
}

async function main() {
  const tenantId = 'tenant_test_1787011929715';
  await gerarPautasParaCanal(tenantId);
  await processarProximaIdeia(tenantId);
}

main();
