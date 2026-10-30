# Validação — MVP-001 (histórico) e MVP-002 (atual)

Data: 29/10/2026. Este arquivo registra somente execução real. O histórico abaixo corresponde ao MVP-001; a seção MVP-002 registra a validação atual. Os testes T-001 a T-024 do produto continuam pendentes, com cobertura parcial de persistência de T-008 no MVP-002.

## Casos adicionais de fundação

| ID    | Cenário                                          | Critério                                                                                                                         |
| ----- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| T-025 | Contrato Rust/TypeScript e encapsulamento do IPC | Fixture pública idêntica, campos camelCase, estados verdadeiros, resposta incompatível rejeitada, navegador sem backend simulado |
| T-026 | Tela inicial                                     | Carregamento antes da resposta, erro sanitizado, nova tentativa e status coerentes                                               |
| T-027 | Janela nativa                                    | Aplicativo abre; status vem do Rust; verificar novamente funciona; tela utilizável                                               |

## Resultados

| Comando / verificação                                                                               | Resultado observado                                                                                             |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                                                                                 | Passou: todos os arquivos abrangidos formatados                                                                 |
| `pnpm lint`                                                                                         | Passou, com `--max-warnings 0`                                                                                  |
| `pnpm typecheck`                                                                                    | Passou, sem erros                                                                                               |
| `pnpm test`                                                                                         | 2 arquivos; 13 testes passaram (T-025/T-026)                                                                    |
| `pnpm build`                                                                                        | Passou; 19 módulos; assets locais em `dist`                                                                     |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`                                         | Passou                                                                                                          |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline`                                | 1 teste Rust passou; 0 falhas (T-025)                                                                           |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --offline --all-targets -- -D warnings` | Passou                                                                                                          |
| `pnpm desktop:build`                                                                                | Passou; executável release otimizado em `src-tauri/target/release/mnexo.exe`                                    |
| `pnpm install --frozen-lockfile --offline`                                                          | Passou; lockfile atualizado e dependências reproduzidas pelo cache                                              |
| T-027 — janela nativa                                                                               | Passou no executável release: abertura, reabertura, resposta Rust, botão por clique e teclado e inspeção visual |

O manifesto gerado pelo Tauri foi inspecionado: a única capability ativa é local, vinculada à janela `main`, com somente `allow-get-app-status`. Não foi executado teste de ataque a janela não autorizada.

A janela foi exercitada via Computer Use. Foram observados “Conexão local verificada”, versão 0.1.0, banco “Ainda não inicializado” e IA “Desativado”. O estado vazio foi compactado após a primeira inspeção, o executável foi recompilado e reaberto, e o painel de status ficou visível na área inicial da janela. A ativação por teclado do botão foi conferida; a sequência completa de navegação assistiva abaixo não foi auditada.

## Verificação manual reproduzível (T-027)

1. Abrir `src-tauri/target/release/mnexo.exe` após `pnpm desktop:build` (caminho efetivamente exercitado). Para desenvolvimento, ativar Rust local quando necessário e executar `pnpm desktop:dev`.
2. Confirmar janela “MNEXO — Fontes” e mensagem “Conexão local verificada”.
3. Conferir versão 0.1.0, banco “Ainda não inicializado” e IA “Desativado”.
4. Clicar “Verificar novamente” e conferir retorno ao estado conectado.
5. Navegar por teclado entre link de salto, marca, Fontes e botão de verificação.
6. Em `pnpm dev` aberto num navegador, confirmar aviso para abrir o aplicativo desktop, sem anúncio de conexão verificada.

## Limitações conhecidas

Não há seleção de fontes, indexação, banco, operação de arquivo, cena WebGL, busca, modelo de IA ou teste de instalador. Testes com mocks do frontend não comprovam o IPC real. Revisar código e configuração de permissões não substitui teste completo de ataque a webview comprometido.

**NÃO TESTADO:** execução com a conexão de rede fisicamente desativada, visualização em navegador separado, servidor `desktop:dev`, sequência completa de navegação assistiva, outras máquinas e instaladores. A condição de navegador sem Tauri foi exercitada pelos testes automatizados com mocks. O executável release foi aberto com os assets empacotados, sem servidor Vite.

## MVP-002 — SQLite e migração (RNF-004)

### Casos e cobertura atual

| ID    | Cenário                       | Cobertura                                                                                                                                                                                                         |
| ----- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-025 | Contrato público atualizado   | Duas fixtures compartilhadas Rust/TS: banco pronto/schema 1 e banco indisponível/schema nulo, sem caminhos ou erros internos                                                                                      |
| T-026 | Estados da interface          | Banco indisponível distinto de falha IPC; nova tentativa recupera estado; estados antigos/inconsistentes são rejeitados pelo parser                                                                               |
| T-028 | Banco limpo, reabertura e FKs | Migração sem seed, fontes desabilitadas, Unicode/espaços, hierarquia e inteiro acima do limite seguro JS preservados; duas aberturas concorrentes; `integrity_check = ok` e zero violações em `foreign_key_check` |
| T-029 | Falhas e rollback             | DDL/dados/versão revertidos em erro; banco futuro/estrangeiro/inválido recusado e preservado; tabelas ausentes não anunciadas prontas; lock transitório recuperável                                               |
| T-030 | SQLite FTS5 incorporado       | Índice sintético em banco temporário; consulta com acentos, reabertura, atualização/exclusão e integrity-check do FTS                                                                                             |
| T-031 | Persistência na janela real   | Abertura e reabertura confirmadas por acessibilidade e inspeção somente leitura do banco; visual/clique NÃO TESTADOS                                                                                              |

Todos os bancos de testes automatizados são temporários e ficam em `.tools/test-data`. Os caminhos de fontes são texto fictício; nenhum diretório representado nos registros é acessado. O índice `fixture_knowledge_fts` existe somente nos bancos desses testes, não no banco real do aplicativo.

### Comandos executados

| Comando / verificação                                                                               | Resultado real                                                   |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm lint`                                                                                         | Passou, com `--max-warnings 0`                                   |
| `pnpm typecheck`                                                                                    | Passou                                                           |
| `pnpm test`                                                                                         | 2 arquivos; 20 testes passaram                                   |
| `pnpm build`                                                                                        | Passou; 19 módulos e assets locais                               |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`                                         | Passou                                                           |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline`                                | 16 testes Rust passaram; 0 falhas                                |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --offline --all-targets -- -D warnings` | Passou                                                           |
| `pnpm desktop:build`                                                                                | Passou; executável release em src-tauri/target/release/mnexo.exe |
| `pnpm format:check` após documentação final                                                         | Passou                                                           |

Os comandos Cargo finais acima foram executados com `CARGO_INCREMENTAL=0` no processo de validação, após o ambiente emitir um aviso de hardlink do cache incremental; nenhuma configuração permanente foi alterada. A biblioteca compilada é rusqlite 0.41.1 / libsqlite3-sys 0.39.1, SQLite incorporado 3.54.1.

A primeira validação identificou dois erros de integração corrigidos: retorno `Result` exigido pelo Tauri no comando assíncrono e tipos literais do status no TypeScript. Um teste de RESTRICT foi corrigido após observar o erro real SQLite: `FOREIGN KEY constraint failed`, código estendido 1811 (TRIGGER), enquanto inserções órfãs usam FOREIGNKEY. As execuções finais da tabela passaram.

### Procedimento manual do MVP-002

Resultado real de T-031: o executável release foi aberto e respondeu `Banco local: Pronto` pela árvore de acessibilidade. A consulta independente ao banco, em modo somente leitura, confirmou `user_version = 1`, `application_id = 1296975192` (MNEX), `integrity_check = ok`, zero violações de FK, zero fontes e zero nós; existem somente as tabelas `nodes` e `sources`.

O processo desse executável foi encerrado e reiniciado de forma controlada para testar reabertura. O checksum do banco permaneceu igual e a nova janela voltou a informar `Pronto`. As fixtures de persistência com registros reais em disco são cobertas pelos testes T-028, separados do banco vazio do aplicativo.

Limite da inspeção: a captura mostrou preto/papel de parede, embora a árvore de acessibilidade expusesse a janela e o status correto. A ferramenta Computer Use falhou ao ativar/restaurar a janela com `failed to activate captured window`, inclusive após atualizar a seleção. **Inspeção visual e clique no novo executável: NÃO TESTADOS**. A ação de nova tentativa e a recuperação de banco indisponível foram cobertas pelos testes automatizados da UI.

1. Abrir o executável release e aguardar “Conexão local verificada” e banco “Pronto”.
2. Confirmar banco interno criado com schema 1 e identificador MNEX, sem fontes/nós semeados.
3. Fechar/reabrir e conferir que continua pronto (exercitado por reinício controlado do processo). Acionar “Verificar novamente” manualmente quando o controle visual da janela estiver disponível.
4. Os cenários de rollback, arquivo inválido e banco futuro usam apenas fixtures automatizadas; não adulterar o banco real para simulá-los.

### Limites atuais

T-008 cobre parcialmente reabertura do banco com registros sintéticos, sem índice ou editor de ideias. Backup/restauração, interrupção abrupta de energia, conteúdo/FTS do produto, criptografia, normalização de caminhos, hierarquia entre fontes e ciclos longos permanecem fora do incremento. `Pronto` não significa uma auditoria completa de todas as páginas do banco em cada chamada de status.

Não foram executados testes de instalador, outras máquinas, ataque a webview, conexão fisicamente desligada ou servidor `desktop:dev`. O código não expõe comandos genéricos de SQL, filesystem ou rede ao frontend.
