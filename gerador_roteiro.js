import { gerarRoteiroViking } from './engine/gerador_roteiro.js';

async function run() {
  try {
    const roteiroObj = await gerarRoteiroViking();
    console.log(JSON.stringify(roteiroObj, null, 2));
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

run();
