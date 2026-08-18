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
  throw new Error('❌ ERRO CRÍTICO: GEMINI_API_KEY não foi encontrada no arquivo .env!');
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

/**
 * Passo 1: Geração Real de Pautas (Backlog) via Gemini IA
 */
export async function gerarPautasParaCanal(tenantId = 'tenant_test_1787011929715') {
  console.log('=======================================================');
  console.log(`📌 PASSO 1 REAL: Gerando Pautas no Gemini para Tenant [${tenantId}]`);
  console.log('=======================================================');

  if (!db) {
    throw new Error('❌ Conexão com o Cloud Firestore não foi inicializada.');
  }

  const tenantDoc = await db.collection('tenants').doc(tenantId).get();
  if (!tenantDoc.exists) {
    throw new Error(`❌ O Tenant [${tenantId}] não foi encontrado no Firestore.`);
  }

  const tenantData = tenantDoc.data();
  const nicho = tenantData.niche || tenantData.nicho || 'Tecnologia, IA e Futuro';
  const customPrompt = tenantData.aiPrompt || 'Crie roteiros virais envolventes com ganchos fortes nos primeiros 3 segundos.';

  console.log(`🎯 Nicho do Canal: "${nicho}"`);
  console.log(`🤖 Prompt de Orientação do Canal: "${customPrompt}"`);

  const prompt = `Você é um diretor de conteúdo de vídeos curtos (Shorts/Reels/TikTok).
  Regras de Orientação do Canal: "${customPrompt}".
  Gere exatamente 5 ideias inéditas de vídeos curtos sobre o nicho: "${nicho}".
  
  Retorne ESTREITAMENTE um JSON em formato de array sem markdown ou textos adicionais em volta:
  [
    { "titulo": "Título Curto Impactante", "conceito": "Resumo em 1 frase" }
  ]`;

  console.log('📡 Enviando requisição HTTP real para a API do Gemini 1.5 Flash...');
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const cleanedJson = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

  const pautasArray = JSON.parse(cleanedJson);
  if (!Array.isArray(pautasArray) || pautasArray.length === 0) {
    throw new Error('❌ A API do Gemini não retornou um array de pautas válido.');
  }

  console.log(`\n💾 Salvando ${pautasArray.length} pautas reais no Firestore (/tenants/${tenantId}/pautas)...`);
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
  console.log('✅ 5 Pautas reais salvas com SUCESSO no Firestore!');
  return pautasArray;
}

/**
 * Passo 2: Consumo e Roteirização Real via Gemini IA
 */
export async function processarProximaIdeia(tenantId = 'tenant_test_1787011929715') {
  console.log('\n=======================================================');
  console.log(`📌 PASSO 2 REAL: Roteirização com Gemini IA para Tenant [${tenantId}]`);
  console.log('=======================================================');

  if (!db) {
    throw new Error('❌ Conexão com o Cloud Firestore não foi inicializada.');
  }

  const tenantDoc = await db.collection('tenants').doc(tenantId).get();
  if (!tenantDoc.exists) {
    throw new Error(`❌ O Tenant [${tenantId}] não foi encontrado no Firestore.`);
  }

  const tenantData = tenantDoc.data();
  const customPrompt = tenantData.aiPrompt || 'Atue como um roteirista sênior especialista em vídeos curtos.';

  const pautasSnap = await db.collection('tenants').doc(tenantId).collection('pautas')
    .where('status', '==', 'pendente')
    .limit(1)
    .get();

  if (pautasSnap.empty) {
    console.log('ℹ️ Nenhuma pauta em estado "pendente" foi encontrada. Gerando novas pautas primeiro...');
    await gerarPautasParaCanal(tenantId);
    return processarProximaIdeia(tenantId);
  }

  const ideaDoc = { id: pautasSnap.docs[0].id, ref: pautasSnap.docs[0].ref, ...pautasSnap.docs[0].data() };
  console.log(`📌 Ideia Selecionada do Banco: "${ideaDoc.titulo}" [ID: ${ideaDoc.id}]`);

  const prompt = `Atue como roteirista sênior de vídeos curtos (Shorts/Reels/TikTok).
  Regras do Canal: "${customPrompt}".
  Escreva um roteiro completo de narração de 60 segundos sobre o tema: "${ideaDoc.titulo}".
  Conceito: "${ideaDoc.conceito || ''}".
  
  Retorne ESTREITAMENTE um objeto JSON válido sem textos adicionais:
  {
    "titulo": "${ideaDoc.titulo} #Shorts",
    "descricao": "Descrição curta e envolvente para o vídeo...",
    "tags": ["#shorts", "#viral", "#conteudo"],
    "roteiro_locucao": "Texto completo e contínuo da narração em português do Brasil..."
  }`;

  console.log('📡 Enviando requisição HTTP real para a API do Gemini para gerar o Roteiro...');
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const cleanedJson = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

  const roteiroFinal = JSON.parse(cleanedJson);

  if (!roteiroFinal.roteiro_locucao) {
    throw new Error('❌ O JSON retornado pelo Gemini não possui o campo "roteiro_locucao".');
  }

  // Atualiza a pauta no Firestore para 'em_producao'
  await ideaDoc.ref.update({ status: 'em_producao', updatedAt: new Date().toISOString() });

  // Cria o novo Job em /video_jobs com status 'AUDIO_GEN'
  const jobId = `job_${Date.now()}`;
  const jobRef = db.collection('video_jobs').doc(jobId);
  await jobRef.set({
    tenantId,
    pautaId: ideaDoc.id,
    status: 'AUDIO_GEN',
    script: roteiroFinal,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  console.log(`✅ Novo Job de Vídeo [${jobId}] criado no Firestore!`);
  console.log(`   └─ Status: 'AUDIO_GEN'`);
  console.log(`   └─ Título: "${roteiroFinal.titulo}"`);

  return { jobId, roteiro: roteiroFinal };
}

async function main() {
  try {
    const tenantId = 'tenant_test_1787011929715';
    await gerarPautasParaCanal(tenantId);
    await processarProximaIdeia(tenantId);
  } catch (err) {
    console.error('❌ Erro na Roteirização Gemini:', err.message);
    process.exit(1);
  }
}

main();
