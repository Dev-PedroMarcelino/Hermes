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
 * 1. Sistema Anti-Repetição: Busca os últimos 20 títulos gerados para o canal no Firestore
 */
async function obterUltimosTitulosDoCanal(tenantId, limite = 20) {
  if (!db) return [];

  try {
    const snap = await db.collection('tenants').doc(tenantId).collection('pautas')
      .orderBy('createdAt', 'desc')
      .limit(limite)
      .get();

    const titulos = snap.docs.map(doc => doc.data().titulo).filter(Boolean);
    return titulos;
  } catch (err) {
    console.warn('⚠️ Aviso ao buscar memória de contexto:', err.message);
    return [];
  }
}

/**
 * Passo 1: Geração Automática com Memória Anti-Repetição & Prompt de Alta Retenção
 */
export async function gerarPautasParaCanal(tenantId = 'tenant_test_1787011929715') {
  console.log('=======================================================');
  console.log(`📌 PASSO 1 REAL: Geração Anti-Repetição para Tenant [${tenantId}]`);
  console.log('=======================================================');

  if (!db) throw new Error('❌ Conexão com o Cloud Firestore não foi inicializada.');

  const tenantDoc = await db.collection('tenants').doc(tenantId).get();
  if (!tenantDoc.exists) throw new Error(`❌ O Tenant [${tenantId}] não foi encontrado.`);

  const tenantData = tenantDoc.data();
  const nicho = tenantData.niche || tenantData.nicho || 'Tecnologia, IA e Futuro';
  const customPrompt = tenantData.aiPrompt || 'Crie roteiros virais de altíssima retenção.';

  // 1. Memória de Contexto Anti-Repetição
  const ultimosTitulos = await obterUltimosTitulosDoCanal(tenantId, 20);
  console.log(`🧠 Memória de Contexto: ${ultimosTitulos.length} títulos recuperados para evitar duplicação.`);

  const listaTitulosExcluir = ultimosTitulos.length > 0 
    ? `\n⚠️ ATENÇÃO: Os novos temas DEVEM ser 100% inéditos e TOTALMENTE DIFERENTES destes últimos títulos já gerados:\n- ${ultimosTitulos.join('\n- ')}\n`
    : '';

  const prompt = `Você é um diretor de conteúdo especialista em canais Cash-Cow virais.
  Regras do Canal: "${customPrompt}".
  ${listaTitulosExcluir}
  REGRA ESTREITA DE RETENÇÃO:
  Os primeiros 3 segundos do roteiro_locucao DEVEM conter um gancho de extrema curiosidade ou uma afirmação chocante para maximizar a retenção no YouTube Shorts/TikTok.

  Gere exatamente 5 ideias inéditas de vídeos curtos sobre o nicho: "${nicho}".
  
  Retorne ESTREITAMENTE um JSON em formato de array sem markdown ou textos ao redor:
  [
    { "titulo": "Título Curto Impactante", "conceito": "Resumo do gancho viral" }
  ]`;

  console.log('📡 Enviando requisição para Gemini com filtro anti-repetição...');
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const cleanedJson = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

  const pautasArray = JSON.parse(cleanedJson);

  console.log(`\n💾 Salvando 5 pautas inéditas no Firestore (/tenants/${tenantId}/pautas)...`);
  const batch = db.batch();
  const pautasRef = db.collection('tenants').doc(tenantId).collection('pautas');

  for (const pauta of pautasArray) {
    const newDoc = pautasRef.doc();
    batch.set(newDoc, {
      titulo: pauta.titulo,
      conceito: pauta.conceito,
      status: 'pendente',
      isMiniseries: false,
      createdAt: new Date().toISOString()
    });
  }

  await batch.commit();
  console.log('✅ 5 Pautas inéditas salvas com SUCESSO no Firestore!');
  return pautasArray;
}

/**
 * 2. Motor de Séries e Minisséries (Pauta Manual com Cliffhanger)
 */
export async function gerarSerieManual({ tenantId = 'tenant_test_1787011929715', temaManual, quantidadePartes = 3 }) {
  console.log('=======================================================');
  console.log(`📌 MOTOR DE SÉRIES: Gerando Minissérie em ${quantidadePartes} partes`);
  console.log(`🎯 Tema Central: "${temaManual}"`);
  console.log('=======================================================');

  if (!db) throw new Error('❌ Conexão com o Cloud Firestore não foi inicializada.');

  const serieId = `serie_${Date.now()}`;

  const prompt = `Você é um roteirista especialista em minisséries virais de alta retenção (Cash Cow).
  Crie uma minissérie de exatamente ${quantidadePartes} partes encadeadas sobre o tema: "${temaManual}".
  
  REGRAS OBRIGATÓRIAS:
  1. Cada parte deve ter um título especificando o número da parte (Ex: "${temaManual} - Parte 1").
  2. Os primeiros 3 segundos de CADA parte DEVEM conter um gancho de extrema curiosidade ou afirmação chocante.
  3. CADA parte (exceto a última) DEVE terminar com um "cliffhanger/gancho" dramático e misterioso conectando diretamente à próxima parte (Ex: "Mas o que os cientistas descobriram a seguir mudou tudo... assista à Parte 2").
  
  Retorne ESTREITAMENTE um array JSON contendo o roteiro de cada parte:
  [
    {
      "ordem": 1,
      "parte": "Parte 1 de ${quantidadePartes}",
      "titulo": "${temaManual} - Parte 1 #Shorts",
      "descricao": "Parte 1 da minissérie impressionante sobre ${temaManual}.",
      "tags": ["#shorts", "#minisserie", "#parte1"],
      "roteiro_locucao": "Gancho dos primeiros 3 segundos... Conteúdo principal... Cliffhanger conectando à Parte 2."
    }
  ]`;

  console.log('📡 Solicitando geração da minissérie encadeada ao Gemini...');
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const cleanedJson = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

  const partesArray = JSON.parse(cleanedJson);

  if (!Array.isArray(partesArray) || partesArray.length === 0) {
    throw new Error('❌ Falha na geração da minissérie pelo Gemini.');
  }

  console.log(`\n💾 Salvando ${partesArray.length} partes encadeadas no Firestore (/video_jobs)...`);

  const jobsCriados = [];
  for (const parte of partesArray) {
    const jobId = `job_serie_${parte.ordem}_${Date.now()}`;
    const jobRef = db.collection('video_jobs').doc(jobId);
    
    const jobData = {
      tenantId,
      serieId,
      ordem: parte.ordem,
      isMiniseries: true,
      totalPartes: partesArray.length,
      status: 'AUDIO_GEN',
      script: parte,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await jobRef.set(jobData);
    jobsCriados.push({ jobId, parte: parte.parte, titulo: parte.titulo });
  }

  console.log(`✅ Minissérie [${serieId}] com ${partesArray.length} partes gravada no Firestore!`);
  return { serieId, jobs: jobsCriados, partes: partesArray };
}

/**
 * Roteirização do próximo Job pendente
 */
export async function processarProximaIdeia(tenantId = 'tenant_test_1787011929715') {
  console.log('\n=======================================================');
  console.log(`📌 PASSO 2 REAL: Roteirização Gemini com Gancho nos primeiros 3s`);
  console.log('=======================================================');

  if (!db) throw new Error('❌ Conexão com o Cloud Firestore não foi inicializada.');

  const pautasSnap = await db.collection('tenants').doc(tenantId).collection('pautas')
    .where('status', '==', 'pendente')
    .limit(1)
    .get();

  if (pautasSnap.empty) {
    console.log('ℹ️ Nenhuma pauta pendente. Gerando pautas inéditas anti-repetição...');
    await gerarPautasParaCanal(tenantId);
    return processarProximaIdeia(tenantId);
  }

  const ideaDoc = { id: pautasSnap.docs[0].id, ref: pautasSnap.docs[0].ref, ...pautasSnap.docs[0].data() };
  console.log(`📌 Ideia Selecionada: "${ideaDoc.titulo}"`);

  const prompt = `Atue como roteirista sênior especialista em vídeos curtos virais.
  REGRA ESTREITA DE MONETIZAÇÃO & RETENÇÃO:
  Os primeiros 3 segundos do roteiro_locucao DEVEM conter um gancho de extrema curiosidade ou uma afirmação chocante para maximizar a retenção no YouTube Shorts/TikTok.

  Escreva o roteiro completo de narração de 60 segundos para: "${ideaDoc.titulo}".
  
  Retorne ESTREITAMENTE um objeto JSON válido:
  {
    "titulo": "${ideaDoc.titulo} #Shorts",
    "descricao": "Descrição curta e viral...",
    "tags": ["#shorts", "#viral", "#conteudo"],
    "roteiro_locucao": "Gancho chocante nos primeiros 3 segundos... Texto da narração..."
  }`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const cleanedJson = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();

  const roteiroFinal = JSON.parse(cleanedJson);

  await ideaDoc.ref.update({ status: 'em_producao', updatedAt: new Date().toISOString() });

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

  console.log(`✅ Novo Job [${jobId}] criado no Firestore!`);
  return { jobId, roteiro: roteiroFinal };
}

async function main() {
  try {
    const tenantId = 'tenant_test_1787011929715';
    await gerarPautasParaCanal(tenantId);
    await processarProximaIdeia(tenantId);
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

main();
