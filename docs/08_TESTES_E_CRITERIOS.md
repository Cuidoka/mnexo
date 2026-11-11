# Validação — histórico e MVP-003 atual

Histórico: 29/10/2026. Validação atual do MVP-003: 09/11/2026, na seção final. Este arquivo registra somente execução real; as seções anteriores preservam resultados e limitações dos respectivos incrementos. T-008 continua parcial; T-001/T-014 têm a cobertura de fontes descrita no MVP-003.

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

## MVP-003 / RF-001 — fontes autorizadas (09/11/2026)

### Casos executados

| ID    | Cobertura real                                                                                                                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-001 | Pasta sintética local escolhida pelo serviço de seleção, confirmação obrigatória, UUID v4 do backend e autorização persistida após reabrir o banco                                                                                                    |
| T-014 | Revogação persistida preservando cadastro/arquivo e reautorização com o mesmo ID; revogação também funciona com pasta indisponível. Ideias/vínculos não existem como funcionalidade e não foram declarados testados                                   |
| T-032 | Cancelamento/novo diálogo invalidam tokens, replay e token/caminho inventado não concedem acesso, apenas um picker ativo, rejeição de arquivo/raiz relativa/ausente/UNC, revalidação antes de gravar, erro de banco consome o token                   |
| T-033 | Caminho equivalente e alias Windows com diferenças de caixa/Unicode não duplicam a fonte; ID/data preservados                                                                                                                                         |
| T-034 | Fixtures Rust/TS compartilhadas, validação do retorno IPC, estado de carregamento/erro, confirmação e cancelamento na UI, falha ao salvar sem falso sucesso, listagem persistida e revogação                                                          |
| T-035 | Janela release e diálogo nativo abertos e inspecionados visualmente; fontes existentes recarregadas após reinício. Confirmação/cancelamento/revogação da fixture pela GUI não foram concluídos devido à entrada concorrente detectada pela ferramenta |

Os testes automatizados usam exclusivamente pastas/bancos sintéticos temporários em `.tools/test-data`. A preservação do conteúdo é verificada por comparação de bytes e o cadastro da fonte não insere nenhum nó no índice. Nenhuma fonte é cadastrada na inicialização. O caso de Unicode é exercitado no filesystem local e no banco; abertura de arquivos/preview não faz parte do ticket.

### Comandos e resultados

| Comando                                                                                             | Resultado observado                        |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `pnpm lint`                                                                                         | Passou, com `--max-warnings 0`             |
| `pnpm typecheck`                                                                                    | Passou                                     |
| `pnpm test`                                                                                         | 4 arquivos; 42 testes passaram; 0 falhas   |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline`                                | 27 testes Rust passaram; 0 falhas          |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --offline --all-targets -- -D warnings` | Passou                                     |
| `pnpm build`                                                                                        | Passou; 21 módulos e assets locais         |
| `pnpm desktop:build`                                                                                | Passou; executável Windows release gerado  |
| `pnpm format:check` e `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`                   | Passaram; `git diff --check` também passou |

Rust/Cargo 1.99.1, Node 22.16.0 e pnpm 10.19.0 conferidos neste incremento. O plugin de diálogo é 2.8.4; UUID permaneceu em 1.29.0 no lockfile. Os testes/Clippy Cargo foram executados com `CARGO_INCREMENTAL=0` no processo, conforme a validação anterior. A primeira compilação identificou um lifetime temporário da consulta SQLite, corrigido coletando as linhas antes de encerrar o statement; a execução final passou.

A capability gerada foi inspecionada: apenas janela `main`, origem local, com os seis comandos de aplicação. Não foram concedidas permissões genéricas de filesystem, SQL ou diálogo. O scan segue sem comando/job implementado.

### Inspeção nativa e limite da automação

O executável exibiu a nova tela, banco pronto, seleção de pasta e lista real do SQLite. O botão abriu o diálogo “Selecionar pasta para o MNEXO”, vinculado à janela principal. A inspeção confirmou a aparência e os controles nativos; o picker continua sendo uma interface do SO, inclusive com seus próprios comandos.

Foi criada uma pasta sintética em `.tools/manual-mvp003-*/Pasta de teste ç`, sem conteúdo pessoal. Ao tentar preencher o seletor, a ferramenta detectou entrada concorrente do usuário (`user input was detected in this window; call get_window_state before continuing`). O usuário autorizou continuar o teste; após atualizar/restaurar a janela a condição voltou a ocorrer, impedindo concluir a sequência por automação. Os cliques de confirmação/revogação dessa fixture no executável são **NÃO TESTADOS**; o fluxo completo é coberto nos testes de serviço/SQLite e nos testes da UI com mocks, sem confundir isso com um E2E nativo completo.

O processo do MNEXO foi reiniciado de forma controlada durante a recuperação. O checksum do banco permaneceu igual e os cadastros já existentes reapareceram. A automação não autorizou nem revogou fontes pessoais e não criou cadastro sintético na instância real; os registros existentes foram preservados. A pasta sintética manual fica no workspace ignorado pelo Git para eventual repetição do teste.

### Repetir manualmente

1. Abrir `src-tauri/target/release/mnexo.exe` e selecionar uma pasta de fixture dentro do projeto.
2. Cancelar o diálogo e conferir que nenhuma fonte nova aparece.
3. Selecionar novamente; conferir o caminho na revisão. Cancelar a autorização e conferir que não há cadastro.
4. Selecionar e **Autorizar pasta**. Conferir fonte autorizada e nenhuma varredura iniciada.
5. Fechar/reabrir e conferir a mesma fonte. Selecionar novamente a mesma pasta para conferir ausência de duplicação.
6. Revogar, reabrir e conferir estado revogado, preservando os arquivos. Reautorizar por nova escolha deve preservar o ID.

### Não testado e fora do incremento

Confirmação/revogação E2E por automação nativa ficaram limitadas pela entrada concorrente. Criação de fixtures symlink/junction, volumes externos, filesystem sensível a caixa, arquivos com nomes não representáveis em UTF-8, encerramento abrupto no meio de um grant e instaladores não foram testados. UNC é recusado antes de acessar a rede; não há testes de fontes remotas. Renomeações, índices/ideias/vínculos, backups e scanner continuam em seus próprios tickets. Nenhuma varredura do PC foi executada.

## MVP-004 / RF-002 — metadados da fixture (09/11/2026)

### Casos automatizados executados

| ID                | Cobertura real                                                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-002/T-003       | Árvore real sintética, relações pai-filho, agregação de bytes, raiz/pasta vazia e arquivo de zero bytes no SQLite. Navegação visual de nós permanece MVP-006.                                                              |
| T-004             | Nomes Unicode/espaços, caminhos e datas preservados no filesystem/SQLite; abertura de arquivos não faz parte deste passo.                                                                                                  |
| T-005             | Falhas injetadas de metadados, abertura de diretório e avanço de iterador; demais entradas continuam e pastas ancestrais ficam parciais. Não foram alteradas ACLs de pastas pessoais.                                      |
| T-006             | Junções Windows reais para ancestral e diretório sintético externo: ambas ignoradas, sem loop nem bytes externos. Raiz com junção recusada.                                                                                |
| T-008             | Reabertura recupera metadados/relatório, sem reindexar. Ideias continuam pendentes.                                                                                                                                        |
| T-014/T-037       | Revogação durante enumeração interrompe publicação e preserva snapshot anterior; fonte revogada, inexistente ou fora da fixture é recusada.                                                                                |
| T-028/T-029/T-036 | Migração schema 1 → 2 preserva autorização/nós/inteiro de 64 bits; falha ao publicar relatório reverte também os nós; reindexação preserva UUIDs e distingue snapshot atual de registros retidos.                          |
| T-038             | Exclusões conservadoras, limites de entradas/profundidade/tempo e amostra de 100 ocorrências com total separado. Os limites são verificados entre operações, sem promessa de interromper uma chamada bloqueada.            |
| T-039             | Fixture de contrato compartilhada Rust/TS, bytes acima de 2^53 preservados, relatório inconsistente recusado, nenhuma indexação automática, botão restrito à fixture, relatório persistido/erro/repetição na UI com mocks. |

Os testes Rust de scanner usam somente `.tools/test-data`, com banco isolado e arquivos sintéticos. Comparam bytes e data de modificação antes/depois para confirmar preservação; o scanner não abre conteúdo. O teste de junções remove apenas suas junções sintéticas, sem recursão nos destinos. Não há scan de fontes pessoais.

### Comandos e resultados observados

| Comando                                                                                             | Resultado real                                                                                                                 |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm fixture:prepare` (duas execuções)                                                             | Passou; segunda execução preservou arquivos. Metadados conferidos: 3 arquivos de 25/16/0 bytes, 3 pastas incluindo raiz/vazia. |
| `pnpm lint`                                                                                         | Passou, zero warnings permitidos.                                                                                              |
| `pnpm typecheck`                                                                                    | Passou.                                                                                                                        |
| `pnpm test`                                                                                         | 5 arquivos; 57 testes passaram, zero falhas.                                                                                   |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline`                                | 38 testes Rust passaram, zero falhas.                                                                                          |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --offline --all-targets -- -D warnings` | Passou.                                                                                                                        |

Cargo foi executado após `Use-LocalRust.ps1`, com `CARGO_INCREMENTAL=0` somente no processo. A primeira execução teve 37 passes e uma falha de acesso ao criar a junção no sandbox. A repetição com permissão revelou uma mistura de separadores no caminho usado pelo teste com `mklink`; canonicalizar o destino sintético corrigiu o teste. A execução final passou, inclusive T-006. Clippy também identificou uma comparação booleana literal no teste de migração, corrigida para assert. Isso não foi tratado como sucesso antes da repetição.

`pnpm desktop:build` passou, incluindo `pnpm build` (23 módulos) e o executável Windows release. A primeira tentativa no sandbox não conseguiu substituir `mnexo.exe` por acesso negado; a repetição autorizada concluiu o build. `pnpm format:check`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` e `git diff --check` passaram. Os três documentos originais continuam sem diff.

### T-040 — inspeção nativa desta entrega

O build release abriu com banco pronto e as duas fontes existentes preservadas na interface; fontes pessoais não exibem ação de indexação. O botão de seleção abriu o diálogo nativo vinculado à janela. Ao preencher exclusivamente o caminho da fixture do projeto, a ferramenta retornou `user input was detected in this window; call get_window_state before continuing`; a nova captura mostrou o diálogo fechado. A automação não concluiu autorização/indexação da fixture na instância real e não alterou fontes pessoais.

Uma consulta independente, em modo SQLite somente leitura, confirmou schema 2, duas fontes (uma autorizada), zero nós, zero relatórios, `integrity_check = ok` e zero violações de FK. Isso também confirma ausência de scan automático na instância verificada. A capability gerada contém somente os sete comandos estreitos da aplicação, janela main e origem local, sem permissões genéricas de plugins.

Confirmação, indexação, apresentação do relatório e reabertura desse relatório pela GUI nativa: **NÃO TESTADAS**. O percurso de scanner/SQLite é exercitado com filesystem real em fixtures isoladas; a UI/IPC é exercitada com mocks explicitados. Esses resultados não são apresentados como E2E nativo completo. A fixture preparada fica em `.tools/fixtures/mvp-004` para repetição manual.

### Repetir o fluxo

1. Executar `pnpm fixture:prepare` na raiz do checkout e compilar/abrir o desktop.
2. Selecionar `.tools/fixtures/mvp-004` pelo diálogo nativo e autorizar. Conferir que não existe relatório antes do clique de indexação.
3. Clicar **Indexar metadados da fixture**, conferir 3 arquivos/3 pastas/41 bytes na fixture recém-criada e ausência de ocorrências.
4. Reabrir e conferir o mesmo relatório, sem novo scan; repetir o clique deve manter os IDs dos caminhos.
5. Revogar a fixture e conferir que não se oferece indexação. Outras fontes autorizadas não recebem o botão e são recusadas no backend.

### Limites do incremento

RF-002 continua restrito à fixture do checkout de compilação. Não há scan geral, progresso/cancelamento, árvore 2D/3D, leitura de conteúdo, envio remoto ou IA. Não foram testados volumes externos, nomes não UTF-8, troca maliciosa de diretórios durante o percurso, perda de energia, outras máquinas ou instaladores. T-005 usa falhas controladas, sem afirmar validação de todas as ACLs Windows. Backup/restauração, identidade do filesystem e retenção/limpeza do índice seguem pendentes. ADR 0004 permanece **proposto**.

## MVP-005 / RNF-002 — progresso, status e cancelamento (09/11/2026)

Base observada: main `08bf305`, com PR #1 integrada manualmente pelo usuário. O scanner anterior já usava worker, mas aguardava o fim no IPC e aplicava busy global à tela. O incremento mantém schema 2 e o escopo da fixture; não adiciona banco/histórico de jobs.

### Casos executados

| ID                | Cobertura real                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-007/T-041       | Um único job ativo por processo; início concorrente recusado, IDs antigos não cancelam job novo, pedido muda para cancelling e somente a saída do worker confirma cancelled.                                                                                                                                                                                                                                                                 |
| T-007/T-008       | Worker real de teste aguarda uma barreira dentro de metadata; uma thread independente consulta status e solicita cancelamento antes da liberação, com resposta recebida dentro do limite de 2 s do teste. Outra consulta SQLite continua disponível. Após liberar o I/O, o worker confirma cancelamento e preserva snapshot anterior. Nova tentativa parte do zero e conclui com contagens corretas. Não é benchmark de latência nem de FPS. |
| T-007/T-041       | Pedido na fronteira anterior à publicação descarta trabalho e conserva relatório; pedido após entrar em publishing retorna SCAN_FINISHING, sem anunciar cancelamento/rollback de COMMIT.                                                                                                                                                                                                                                                     |
| T-037/T-041       | Fonte revogada termina failed com código público e libera o slot; fixture, limites e checagens de autorização anteriores continuam cobertos pela suíte de metadados.                                                                                                                                                                                                                                                                         |
| T-042             | Fixture JSON compartilhada Rust/TS com jobId/sourceId, estados e contagens, incluindo bytes acima de 2^53; respostas inconsistentes, origem/ID de job incorretos e execução no navegador são recusados.                                                                                                                                                                                                                                      |
| T-007/T-039/T-042 | UI com mocks: nenhum início automático, botão de cancelar ativo durante execução, pedido distinto de confirmação, reinício, fase de publicação, relatório recarregado uma vez por término e ações de fontes habilitadas durante o scan.                                                                                                                                                                                                      |
| T-042             | Polling sequencial, resposta antiga não apaga um job recém-iniciado, falha de consulta preserva último estado conhecido e se recupera, desmontagem interrompe polling e ignora resposta tardia.                                                                                                                                                                                                                                              |

O teste de I/O bloqueado usa canais/barreira, com timeout de proteção de cinco segundos, sem adicionar atrasos ao scanner de produção. Arquivos/bancos são fixtures próprias em `.tools/test-data`; o teste compara conteúdo sintético preservado. Os testes de UI declaram mocks e controle de tempo; não são E2E nativo.

### Comandos e resultados

| Comando                                                                                             | Resultado observado                          |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline`                                | 43 testes Rust passaram; zero falhas.        |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --offline --all-targets -- -D warnings` | Passou.                                      |
| `pnpm test`                                                                                         | 7 arquivos; 76 testes passaram; zero falhas. |
| `pnpm lint`                                                                                         | Passou, zero warnings permitidos.            |
| `pnpm typecheck`                                                                                    | Passou.                                      |

Cargo foi executado com `Use-LocalRust.ps1` e `CARGO_INCREMENTAL=0` somente no processo. A primeira execução frontend teve 73 passes e três timeouts na combinação de user-event com timers falsos. Os testes específicos de polling passaram a usar eventos click explícitos dentro de act e avanço controlado do relógio; os fluxos de tela Fontes continuam usando user-event. A repetição da suíte completa passou. O produto não recebeu atrasos artificiais ou mudanças de tempo para contornar o teste.

`pnpm desktop:build` passou, incluindo `pnpm build` (25 módulos) e executável Windows release. `pnpm format`, `pnpm format:check`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` e `git diff --check` passaram. Os três documentos originais continuam sem diff. Após o checkout da main, o Git normalizou CRLF no worktree; a comparação/publicação usa normalização de texto, sem incluir mudanças de conteúdo não relacionadas ao incremento.

### T-043 — inspeção nativa

O executável abriu com banco pronto, as duas fontes existentes preservadas e o novo painel indicando nenhum job. A fixture `.tools/fixtures/mvp-004` foi selecionada pelo diálogo nativo e autorizada pela confirmação do aplicativo. Antes do clique de indexação, o painel continuou sem job. A ferramenta inicialmente não resolveu um elemento em cache do diálogo; a navegação por seu campo de endereço permitiu concluir a seleção sem usar comandos de shell.

O clique em **Indexar metadados da fixture** mostrou running, barra indeterminada e botão **Cancelar varredura**. A consulta seguinte mostrou completed: seis entradas visitadas, três arquivos, três pastas, 41 bytes, zero ignoradas e zero ocorrências. A UI carregou o relatório persistido com os mesmos totais. A inspeção encontrou o aviso anterior de autorização ainda visível após iniciar o scan; a correção limpa esse aviso no início e foi incluída no teste da tela Fontes. A suíte frontend final voltou a passar.

Consulta independente em SQLite somente leitura confirmou schema 2, três fontes, seis nós (todos da fixture), um relatório, `integrity_check = ok` e zero violações de FK. Fontes pessoais não receberam nós nem foram varridas. O teste só adicionou a fonte sintética e seus metadados na instância real.

Uma nova abertura independente do SQLite após recompilar confirmou o mesmo scan_id e checksum do banco, sem alterações. A capability gerada contém somente os nove comandos estreitos previstos, janela main e origem local; o comando antigo de scan não existe mais no handler nem na capability.

O executável final foi recompilado após corrigir o aviso. Ao iniciar a verificação de reabertura, o usuário interrompeu o Computer Use com Escape; a automação da interface foi encerrada. Reabertura completa do executável final e cancelamento confirmado pela GUI nativa em scan prolongado: **NÃO TESTADOS**; a fixture pequena termina rapidamente. O controle sob I/O bloqueado é validado no backend real de teste, e o fluxo de pedido/confirmação na UI usa mocks declarados. Não se confunde essa cobertura com benchmark nativo de latência/FPS.

### Procedimento manual

1. Preparar a fixture com `pnpm fixture:prepare`; selecionar/autorizar somente `.tools/fixtures/mvp-004`.
2. Conferir **Andamento da indexação**, inicialmente sem job, sem scan automático. Clicar **Indexar metadados da fixture** e observar contagens/status; em árvore muito pequena pode concluir antes da próxima consulta.
3. Durante running, clicar **Cancelar varredura**. Conferir primeiro pedido e depois confirmação; relatório anterior deve continuar disponível. Em publishing, o cancelamento não é oferecido.
4. Iniciar novamente por clique. Deve começar da raiz e atualizar relatório somente ao terminar; verificar fontes/listagem/revogação durante o percurso.
5. Recarregar apenas a tela recupera o último job do mesmo processo. Fechar/reabrir o processo limpa o estado do job e mantém o último índice/relatório salvo, sem nova varredura.

### Limites

Sem promessa de interrupção imediata de uma chamada bloqueada, tempo absoluto de cancelamento ou 60 FPS. Sem pausa/retomada por checkpoint, histórico persistente, concorrência entre múltiplos processos, scan de pastas pessoais, navegação 2D/3D, conteúdo ou IA. RNF-010 permanece parcial/pendente. Não foram testados perda de energia, crash durante COMMIT, outras máquinas, instaladores ou conexão fisicamente desligada. ADR 0005 continua **proposto**.

## MVP-006 / RF-006 — catálogo 2D e metadados (09/11/2026)

Base: main `af4ec1e`, após PR #2 do MVP-005. O catálogo já possuía hierarquia, metadados e snapshot; não existiam consultas/visualização de nós. O incremento mantém schema 2 e consulta exclusivamente metadados persistidos, sem varrer ou abrir os arquivos da fonte.

### Casos executados

| ID                      | Cobertura real                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-003/T-004/T-009/T-044 | Indexação de árvore sintética real, leitura de raiz/filhos/detalhes, breadcrumbs, pai e origem, Unicode/espaços, pasta vazia, arquivo zero bytes e soma de pasta. Consulta do catálogo conserva os bytes do banco e dos arquivos sintéticos.     |
| T-008/T-044             | Reabrir o banco e consultar metadados salvos de arquivo sintético removido depois do scan; o catálogo não exige que o arquivo ainda esteja acessível.                                                                                            |
| T-045                   | Paginação keyset de 122 filhos em três páginas, sem lacunas/duplicações; pastas antes de arquivos, limite Rust de 1–100 e cursor de outra pasta recusado.                                                                                        |
| T-046                   | Snapshot anterior e nós retidos são recusados depois de reindexar; UUID da raiz preservado; revogação bloqueia filhos/detalhes. Na UI, revogar fecha o catálogo e atualizar snapshot remonta na raiz.                                            |
| T-047                   | IDs inválidos/injeção não viram SQL, nós/pais de outra fonte não são retornados, ciclos e caminhos fora da raiz são recusados. Ausência de snapshot e de raiz navegável possuem erros distintos.                                                 |
| T-044/T-048             | Bytes i64 acima de 2^53 preservados em string; zero é diferente de null; datas ausentes, anteriores a epoch e fora da faixa da UI são apresentadas sem arredondamento ou Invalid Date.                                                           |
| T-009/T-048             | UI com mocks: seleção de arquivo, detalhes, pasta vazia, retorno por pai/breadcrumb e ativação por teclado, carregar mais, erro/repetição e atualização após mudança de snapshot.                                                                |
| T-048                   | Página/detalhe atrasados depois de navegar são ignorados; nomes são texto, sem HTML executável. Fixture Rust/TS verifica contrato, contexto de fonte/snapshot, vínculos e limites da resposta. Navegador sem Tauri não recebe catálogo fictício. |

Os testes Rust criam fontes/bancos somente em `.tools/test-data`. A indisponibilidade de arquivo é simulada removendo apenas o arquivo criado pelo próprio teste; nenhuma fonte real é alterada. Testes que adulteram relações/dados fazem isso apenas no banco sintético para verificar recusa segura. A suíte da UI usa mocks declarados, sem afirmar que substitui o IPC real.

### Comandos e resultados observados

| Comando                                                                                             | Resultado real                                                               |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline`                                | 51 testes Rust passaram; zero falhas.                                        |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --offline --all-targets -- -D warnings` | Passou.                                                                      |
| `pnpm test`                                                                                         | 10 arquivos; 107 testes passaram; zero falhas.                               |
| `pnpm typecheck` e `pnpm lint`                                                                      | Passaram.                                                                    |
| `pnpm desktop:build`                                                                                | Passou, incluindo build frontend de 29 módulos e executável Windows release. |

Cargo foi executado após `Use-LocalRust.ps1`, com `CARGO_INCREMENTAL=0` somente no processo. A primeira execução Rust teve 50 passes e uma falha na comparação textual do caminho esperado com separadores mistos; construir o caminho esperado com joins por componente corrigiu o teste. A primeira execução frontend teve 104 passes e uma consulta de teste ambígua, pois a raiz aparece tanto em caminho do item quanto em origem; a asserção foi ajustada. As repetições completas passaram, sem alterar o produto para contornar os testes.

### T-049 — inspeção nativa e limite encontrado

Formatação final: `pnpm format:check`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` e `git diff --check` passaram. O formatter de normalização do checkout Windows operou somente sobre arquivos rastreados, respeitando o ignore dos três originais e sem incluir docs/design. Os três documentos originais continuam sem diff. A capability gerada contém exatamente os onze comandos previstos, janela main e origem local, sem permissões genéricas novas.

O binário foi gerado e acionado para a verificação. Ao tentar capturar a janela, Computer Use retornou interrupção pelo Escape físico. O usuário autorizou explicitamente retomar; a nova tentativa de listar janelas retornou a mesma interrupção. A automação foi encerrada sem novos comandos de interface. Lista, breadcrumbs e painel completos no executável nativo: **NÃO TESTADOS** nesta entrega. O resultado funcional acima vem dos testes reais de SQLite/backend e da UI com mocks.

Antes da tentativa, consulta independente em SQLite somente leitura confirmou schema 2, três fontes, seis nós da fixture, um relatório (3 arquivos/3 pastas/41 bytes/zero ocorrências), integridade ok e zero violações de FK. Isso confirma a existência do índice usado como alvo da verificação, sem afirmar que a navegação nativa foi concluída.

Nova abertura independente do SQLite após a tentativa retornou o mesmo scan_id e checksum do banco, com as mesmas contagens. Nenhuma indexação foi iniciada nesta verificação.

### Repetir manualmente

1. Abrir o desktop com fixture autorizada e indexada e clicar **Explorar índice 2D** na fonte mvp-004.
2. Conferir raiz, caminho/bytes/datas/fonte no painel e lista de filhos; selecionar raiz.txt deve mostrar os metadados salvos do arquivo, sem abri-lo.
3. Abrir Coleção ç, depois Vazia; conferir vazio/zero e breadcrumb completo. Voltar pela pasta pai e pelo breadcrumb da raiz.
4. Consultar Detalhes de arquivo/pasta, fechar/reabrir o índice e conferir que não ocorre scan automático.
5. Em fixture sintética com mais de 50 filhos, carregar a página adicional; durante reindexação, atualizar catálogo deve usar o novo snapshot e retornar à raiz. Revogar a fixture deve fechar a consulta.

### Limites

RF-006 cobre nós filesystem do catálogo confirmado de fonte habilitada; o scanner continua limitado à fixture. Não há prévia/abertura de conteúdo, abertura no SO, busca, edição, expansão recursiva automática, árvore 3D, seleção persistida ou reconciliação de renomeações. T-004 relativo à abertura de arquivos e T-008 relativo a ideias continuam pendentes. Não foram testados GUI nativa completa, leitor de tela real, outras máquinas, volumes externos, corrupção física do banco ou benchmarks de grandes catálogos. ADR 0006 permanece **proposto**. A pasta docs/design fica fora do incremento.

## MVP-007 / RF-003 — cena 3D inicial (11/11/2026)

Base: main `836463c`, com MVP-006 integrado pela PR #3. O incremento consulta somente o snapshot do índice autorizado. Nenhuma permissão de scanner pessoal, conteúdo, rede ou IA foi acrescentada; schema continua 2. ADR 0007 permanece **proposto**.

### Rastreabilidade e fronteiras

| ID                     | Verificação real                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-003 / T-003 / T-050 | Fixture filesystem sintética indexada em SQLite real com 15 nós; projeção preserva UUID, pai, metadados e ordenação determinística após reabrir; bytes do banco e arquivo sintético permanecem iguais.                                                                                                                                        |
| T-050                  | Exatamente 100 nós não anuncia truncamento; 101 nós limita a 100 incluindo raiz e anuncia itens omitidos. Descendente no nível 4 é omitido, com aviso, preservando pais até nível 3.                                                                                                                                                          |
| T-050                  | Snapshot anterior, autorização revogada, UUID/injeção inválido e caminho corrompido são recusados. Leituras reutilizam filtros fonte/snapshot e validações do catálogo; dados retidos de scans anteriores não entram na cena.                                                                                                                 |
| T-051                  | Contrato SceneProjection compartilhado Rust/TS: raiz, filhos, limites, truncamento, UUIDs/parentesco e bytes acima de 2^53. Frontend recusa pais ausentes/cíclicos/arquivo, duplicações, ordem/depth inválidos, limites alterados, tipo de bytes incorreto e contexto sourceId/scanId trocado. Browser sem Tauri não oferece índice fictício. |
| RF-003 / T-052         | Layout determinístico contém os filhos em todos os três eixos, conserva cada ID/pai e não altera a projeção. Pasta vazia e arquivos zero/null/i64 máximo permanecem visíveis com medidas finitas; sem criar novos IDs.                                                                                                                        |
| T-053                  | UI com mock de renderer: StrictMode monta uma única sessão válida; desmontagem descarta a sessão. Falha/perda de contexto informa alternativa 2D sem exibir erro bruto ou sucesso gráfico fictício.                                                                                                                                           |
| T-054                  | UI com mocks de IPC: abrir só por clique, passar sourceId/scanId, contagem/snapshot, relação textual/bytes exatos, parcialidade/truncamento, retorno 2D, fechar/revogar, erro de snapshot e atualização para novo scan. Resposta atrasada após fechar não reabre a cena; nenhum teste inicia scan por abrir/atualizar cena.                   |
| T-055                  | Renderer de produção em Chrome headless, WebGL 2 real via ANGLE/SwiftShader, fixture JSON sintética de 12 e 100 nós. Pixels exibem geometria, sem erro WebGL; dispose duplo é seguro, canvas é removido e contexto liberado. Evento de perda de contexto descarta sessão e aciona fallback.                                                   |

Os testes Rust criam fontes/bancos em `.tools/test-data`; alterações SQL adversas são restritas a esses bancos sintéticos. A fixture JSON compartilhada não é usada para preencher a cena do produto. O harness gráfico não acessa IPC, SQLite do aplicativo ou perfil pessoal do navegador. Não se afirma que esse harness comprova o caminho de integração nativo completo.

### Comandos e resultados observados

| Comando                                                                                             | Resultado real                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                                                         | 14 arquivos, **135 testes passaram**, zero falhas.                                                                                                                                           |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --offline`                                | **55 testes passaram**, zero falhas, incluindo testes Windows com junções sintéticas.                                                                                                        |
| `pnpm typecheck` e `pnpm lint`                                                                      | Passaram.                                                                                                                                                                                    |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --offline --all-targets -- -D warnings` | Passou.                                                                                                                                                                                      |
| `pnpm desktop:build`                                                                                | Passou: frontend com 37 módulos e executável Windows release. Chunk 3D separado: 539,55 kB minificados / 134,25 kB gzip; Vite avisou tamanho acima de 500 kB.                                |
| `pnpm test:scene:webgl`                                                                             | Passou com 12/100 nós. WebGL 2 real, 80/91 cores amostradas; descarte e perda de contexto passaram nos dois casos. Imagem inspecionada visualmente, com volumes aninhados/arquivos visíveis. |
| `pnpm fixture:prepare:3d`                                                                           | Preparou 12 arquivos e 3 pastas, 203 bytes, somente na fixture fixa; preservou arquivos existentes e não atualizou o índice automaticamente.                                                 |

Cargo foi executado com `Use-LocalRust.ps1` e `CARGO_INCREMENTAL=0` no processo. A primeira compilação apontou que usize não implementa ToSql; o limite foi convertido para u32 (máximo 100). TypeScript inicialmente inferiu apenas o tipo folder no mapa de pais; o mapa ganhou o tipo explícito file/folder. No primeiro teste StrictMode, o mock não interceptou corretamente o import dinâmico; o carregamento sob demanda foi movido para React.lazy/Suspense no painel, preservando a validação da sessão por import estático. Repetições completas passaram. O primeiro build sem ativar o Rust local falhou por cargo ausente no PATH; após ativar o ambiente, o build completo passou.

O teste gráfico usa o Chrome instalado (156.0.8078.80), perfil novo e servidor apenas em 127.0.0.1, com ANGLE/SwiftShader e sem desabilitar o sandbox do navegador. Evidências ignoradas pelo Git: `.tools/scene-webgl-vagUOB/scene.png` e `dom.html`. Nenhuma imagem foi gerada por IA; trata-se de captura do renderer real com dados sintéticos declarados.

`pnpm format:check`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` e `git diff --check` passaram. Revisão da capability e manifesto gerado confirmou exatamente 12 comandos específicos, incluindo get_scene_projection, somente na janela main/origem local. Não foram acrescentadas permissões genéricas. A normalização de formatação do checkout operou sobre arquivos rastreados/novos da tarefa, respeitando os ignores e preservando docs/design e os três originais.

### Inspeção nativa e limite observado

O executável release abriu e a inspeção confirmou banco Pronto, IA Desativado, relatório antigo da fixture e botão Ver cena 3D. Ao interagir, Computer Use retornou `user input was detected in this window; call get_window_state before continuing`. Após reobservar e recuperar o alvo, a tentativa seguinte retornou a mesma interação concorrente. A verificação foi encerrada para preservar o controle do usuário; não houve clique de scan confirmado. Cena e retorno 2D no WebView2 nativo: **NÃO TESTADOS** nesta entrega.

Consultas independentes somente leitura antes/depois confirmaram o mesmo checksum do SQLite, schema 2, três fontes, seis nós da fixture, um relatório (3 arquivos/3 pastas/41 bytes/zero ocorrências), integridade ok e zero violações de FK. Nós de outras fontes: zero. Isso confirma que a preparação dos nove arquivos extras não iniciou scan, nem alterou o índice/banco. Para ver os 15 nós novos no aplicativo, ainda é necessário clicar explicitamente para reindexar a fixture.

### Repetir manualmente e limites

1. Preparar a fixture com `pnpm fixture:prepare:3d`, selecionar/autorizar a raiz fixa se necessário e indexar por clique explícito.
2. Conferir 12 arquivos/3 pastas no relatório; clicar Ver cena 3D deve mostrar 15 nós reais, câmera fixa e pastas contendo filhos.
3. Expandir a relação textual e conferir UUIDs/pais/bytes; comparar com os mesmos itens no índice 2D. Abrir/fechar/atualizar a cena não deve iniciar scan.
4. Redimensionar a janela, fechar/reabrir a cena e verificar o enquadramento. Revogar apenas a fixture deve fechar a cena; nenhuma fonte pessoal precisa ser consultada ou alterada.
5. Em ambiente sem WebGL 2/perda de contexto, conferir mensagem e usar Ver índice 2D.

Não testados: cena/IPC no WebView2 nativo completo, GPU física/outros drivers, outras máquinas, leitor de tela real e benchmarks de grandes índices. Órbita/zoom/seleção/navegação 3D, isolamento/reintegração e persistência da cena permanecem nos tickets seguintes. A pasta docs/design e os três documentos originais ficam fora do incremento.
