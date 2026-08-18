# Scripts legados (não usados em produção)

Estes arquivos são a primeira geração do motor Hermes, mantidos apenas como
referência histórica. **Nada aqui é executado pelo sistema atual.**

O motor em produção é `engine/src/` + `engine/worker.js`.

Por que foram aposentados:

- `gerador_*.js`, `upload_youtube.js`, `pipeline_completo.js`: scripts CLI de
  execução única, só YouTube, com `tokens.json` global (não multi-tenant) e
  fluxo OAuth `urn:ietf:wg:oauth:2.0:oob`, que o Google desativou em 2022.
- Todos chamavam `main()` no topo do módulo, então importá-los disparava a
  execução como efeito colateral.

Se precisar de algo daqui, porte para `engine/src/services/`.
