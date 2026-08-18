import { gerarPautasParaCanal, processarProximaIdeia } from './engine/gerador_pautas_e_roteiro.js';

async function run() {
  const tenantId = 'tenant_test_1787011929715';
  try {
    await gerarPautasParaCanal(tenantId);
    await processarProximaIdeia(tenantId);
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

run();
