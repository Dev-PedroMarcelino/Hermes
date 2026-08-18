import { gerarPautasParaCanal, processarProximaIdeia } from './engine/gerador_pautas_e_roteiro.js';

async function main() {
  try {
    const tenantId = 'tenant_test_1787011929715';
    await gerarPautasParaCanal(tenantId);
    await processarProximaIdeia(tenantId);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

main();
