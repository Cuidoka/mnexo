# Arquitetura — estado do MVP-005

Fonte da proposta completa: seção 03 de `../ESPECIFICACAO_COMPLETA.md`. Este documento registra apenas o incremento implementado e não substitui a especificação.

## Fluxo implementado

React → `src/shared/api/app-status.ts` → IPC Tauri `get_app_status` → worker de bloqueio → armazenamento SQLite → struct Rust serializada em camelCase → validação de contrato TypeScript → status na tela Fontes.

O comando de status não recebe argumentos de usuário. O Tauri resolve um caminho interno fixo; o worker abre o banco, habilita chaves estrangeiras, aplica as migrações e consulta a versão. O caminho do banco, erros internos e SQL não são serializados ou logados. `appVersion` vem de `CARGO_PKG_VERSION`. Não há chamadas de rede ou indexação simulada.

Contrato implementado, verificado pela fixture compartilhada de T-025:

```json
{
  "appVersion": "0.1.0",
  "backendStatus": "ready",
  "databaseStatus": "ready",
  "schemaVersion": 2,
  "assistantStatus": "disabled"
}
```

Em falha de armazenamento, `databaseStatus` é `unavailable` e `schemaVersion` é `null`; `backendStatus` continua `ready` porque o IPC respondeu. A UI mostra banco indisponível e permite nova tentativa. O TypeScript rejeita combinações inconsistentes e versões não inteiras, negativas ou sem precisão segura. Alterações do contrato exigem atualização conjunta dos tipos, fixtures, testes e documentação.

## Persistência do MVP-002

- `rusqlite 0.41.1`, feature `bundled`: SQLite 3.54.1 incorporado, sem plugin SQL no frontend.
- Arquivo interno `app_local_data_dir()/mnexo.sqlite3`; no Windows, diretório local por usuário do identificador `com.mnexo.desktop`.
- Abertura por consulta de status, em `spawn_blocking`; conexão curta, espera de lock limitada a 2 segundos. Falhas transitórias podem ser reavaliadas pelo botão existente.
- Migrações numeradas 001/002, `BEGIN IMMEDIATE`, versão relida sob lock, DDL e `user_version` na mesma transação. Reexecução não duplica tabelas nem registros. A 002 é aditiva e preserva fontes/autorização/nós existentes.
- `application_id = 0x4d4e4558` identifica provisoriamente bancos deste protótipo. Isso não é autenticação criptográfica. Arquivo inválido, versão futura ou banco não reconhecido é recusado sem recriação.
- Tabelas `sources` e `nodes` em modo STRICT; FKs de fonte/pai com RESTRICT, checks de origem/tipo/tamanho, unicidade de caminho por fonte e índices de fonte/pai. O default de fonte continua `enabled = 0`; o MVP-003 grava `enabled = 1` somente após confirmação. O MVP-004 insere somente metadados da fixture e acrescenta `scan_reports`/`scan_issues`.
- FTS5 foi exercitado na biblioteca compilada por um índice de texto sintético isolado dos bancos do aplicativo. `knowledge_items`, `knowledge_fts` e seus triggers não foram antecipados.

`Pronto` indica abertura, identificação, migração e estrutura mínima disponíveis; a UI não realiza auditoria integral do catálogo a cada consulta. `integrity_check` e `foreign_key_check` foram exercitados nos testes. O banco segue as permissões do perfil do SO; criptografia (A-010) continua aberta.

SQL e escolhas de conexão estão registrados nos ADRs 0002/0004, **propostos**, dentro dos incrementos autorizados. A primeira migração cria somente uma base vazia; a segunda acrescenta campos/tabelas sem apagar dados. Não existe downgrade automático. Backup/restauração do produto continuam pendentes.

## Fronteira de segurança

`src-tauri/build.rs` declara os nove comandos de aplicação em `AppManifest::commands`, que gera as permissões específicas durante o build. A capability `main`, vinculada somente à janela `main`, concede status do aplicativo, os cinco comandos de fontes e os três comandos de jobs da fixture. Não há permissões genéricas dos plugins nem origens remotas. Arquivos de permissões gerados são ignorados pelo Git.

A CSP permite scripts locais e transporte IPC; a variante de desenvolvimento adiciona o Vite em `127.0.0.1:1420`. Estilos inline são permitidos para compatibilidade com o desenvolvimento Vite; scripts inline arbitrários não são habilitados por essa regra. O contexto do Tauri injeta os próprios hashes/nonces necessários.

Referências verificadas durante a implementação:

- <https://v2.tauri.app/security/capabilities/>
- <https://v2.tauri.app/develop/calling-rust/>
- <https://v2.tauri.app/security/csp/>

## Fluxo de fontes (MVP-003 / RF-001)

O Rust inicializa `tauri-plugin-dialog 2.8.4`. O diálogo é aberto em worker, com a janela principal como pai. Só uma escolha pode estar aberta por processo; iniciar outra escolha invalida a seleção anterior. Cancelamento nativo retorna `null`. Nenhum caminho é fornecido pelo webview ao seletor.

A raiz escolhida deve ser absoluta, local, existente, diretório e não ser uma raiz symlink/reparse. O backend canonicaliza sem enumerar filhos, mantém uma seleção volátil com UUID aleatório e retorna somente token/caminho exibível/nome. A confirmação consome o token uma vez e revalida a raiz. Tokens não vão para SQLite ou logs. O retorno não concede acesso genérico ao filesystem.

| Comando                        | Entrada do frontend | Saída                               |
| ------------------------------ | ------------------- | ----------------------------------- |
| `choose_scan_source`           | nenhuma             | `FolderSelection` ou `null`         |
| `cancel_scan_source_selection` | nenhuma             | confirmação vazia                   |
| `add_scan_source`              | `selectionToken`    | `ScanSource`                        |
| `list_scan_sources`            | nenhuma             | `ScanSource[]`                      |
| `revoke_scan_source`           | `sourceId`          | `ScanSource` com `authorized=false` |

`FolderSelection`: `{selectionToken, rootPath, displayName}`. `ScanSource`: `{id, rootPath, displayName, authorized, createdAt, fixtureEligible, lastScan}` em camelCase, com fixtures compartilhadas Rust/TS. Os dois últimos campos foram acrescentados no MVP-004. Erros retornam apenas `{code}` conhecido; a UI traduz os códigos sem exibir mensagens internas. Cancelar a confirmação invalida o token no backend; falha ao salvar também o consome, exigindo nova seleção.

O cadastro usa a tabela `sources` existente, sem alterar schema 1. A chave de deduplicação é `root_path` canônico; `INSERT ... ON CONFLICT` preserva UUID e data de criação ao reautorizar. `enabled` representa autorização de metadados, não job em execução. Revogar é `UPDATE enabled=0`; não há deleção, enumeração da pasta nem cascata. A listagem consulta apenas SQLite, permitindo revogar uma pasta que ficou indisponível.

No Windows o banco mantém a sintaxe canônica de caminho longo; a UI recebe o caminho local sem o prefixo técnico. O caso de alias com maiúsculas/Unicode foi exercitado no filesystem desta máquina. Não se usa lowercase irrestrito nem se promete identidade persistente após renomear/mover diretórios. A identidade universal da fonte é o UUID emitido pelo Rust.

O picker nativo permanece uma interface do SO sob controle do usuário. `set_can_create_directories(false)` tem efeito documentado apenas no macOS; não representa bloqueio dos comandos de shell do diálogo Windows. O aplicativo não implementa nem automatiza escrita nas fontes. Detalhes e limites: ADR 0003, **proposto**.

## Metadados da fixture (MVP-004 / RF-002)

No MVP-005, `start_scan(sourceId)` substitui `index_fixture_source`: reserva um job e dispara o worker sem esperar o percurso. O backend continua exigindo fonte habilitada e exatamente a fixture local `.tools/fixtures/mvp-004` do checkout de compilação. O worker consulta somente metadados e diretórios e revalida autorização durante o percurso e antes de publicar. Nenhuma outra fonte pode ser indexada. A indicação de elegibilidade da UI não substitui as checagens Rust. Inicialização, listagem e autorização nunca iniciam jobs.

O script `pnpm fixture:prepare` cria dados sintéticos explicitamente, preservando arquivos existentes. Os testes usam fixtures temporárias separadas. O scanner não oferece criação/remoção/gravação nas fontes e não abre conteúdo. Links/reparse e entradas excluídas são relatados e não percorridos; falhas recuperáveis mantêm a leitura dos demais itens. Nomes/caminhos são dados, renderizados como texto React.

O scanner calcula hierarquia e tamanhos de pastas em memória com limites de 1.000 entradas, profundidade 16, orçamento de 5 segundos entre operações e 100 amostras de ocorrências. Os tamanhos são lógicos por caminho; vazios valem zero, e totais acessíveis são marcados parciais se houver erros/exclusões. Datas de criação/modificação são milissegundos UTC desde epoch, strings decimais assinadas ou null quando indisponíveis.

A migração 002 acrescenta campos às linhas de nós e as tabelas de relatório/amostra. Upsert dos nós e substituição do relatório ocorrem na mesma transação. IDs vêm do backend e são preservados por caminho relativo. O índice atual exige junção por fonte e `scan_id`; nós de snapshots anteriores são retidos sem participar dos totais atuais. Bytes chegam ao TypeScript como string decimal, validados sem conversão para Number. Reabrir/listar lê o relatório salvo, sem reindexação.

`ScanReport`: `{sourceId, scanId, completedAt, filesCount, foldersCount, totalBytes, skippedCount, errorCount, partial, issues, issuesTruncated}`. Cada ocorrência é `{relativePath, code}`, sem mensagem interna do SO. Pasta inclui a raiz; exclusões deliberadas contam como ocorrências e tornam o resultado parcial. A política completa está no ADR 0004, **proposto**.

T-002/T-003/T-004/T-005/T-006/T-008 e T-036 a T-039 cobrem metadados/persistência. A parte de T-004 relativa à abertura de arquivos e a parte de T-008 sobre ideias continuam pendentes. Navegação 2D, uso com fontes pessoais e resistência a mutações hostis durante o percurso ficam para seus tickets/revisão própria; não se declara filesystem snapshot atômico nem timeout rígido.

## Jobs e cancelamento (MVP-005 / RNF-002)

| Comando           | Entrada  | Saída                                                               |
| ----------------- | -------- | ------------------------------------------------------------------- |
| `start_scan`      | sourceId | ScanJob reservado, sem esperar o filesystem                         |
| `get_scan_status` | nenhuma  | Último ScanJob do processo ou null                                  |
| `cancel_scan`     | jobId    | ScanJob com pedido de cancelamento, ou estado terminal já conhecido |

O registro `ScanJobs` mantém um único slot em memória. Mutex curto protege identidade, progresso e transições; nenhuma consulta SQLite ou operação de filesystem roda sob esse lock. start/cancel/status são síncronos e pequenos; o worker de bloqueio é monitorado em tarefa assíncrona para converter falha do worker em código público. Somente um job fica ativo por processo, inclusive em cancelling/publishing. IDs antigos não cancelam uma execução nova.

`ScanJob = {jobId, sourceId, state, progress, errorCode}`. Os estados são running/cancelling/publishing/completed/cancelled/failed. Progresso contém visitedEntries, filesCount, foldersCount, totalBytes decimal, skippedCount e errorCount, sem conteúdo ou caminho atual. O job começa antes da validação de raiz/autorização pelo worker; uma fonte recusada termina failed, sem enumeração.

O walker informa contagens e passa por checkpoints cooperativos. O pedido muda para cancelling; cancelled só ocorre quando o worker reconhece e descarta o resultado. A fronteira before_publish decide, sob o mesmo mutex, entre cancelar e entrar em publishing. Nesse último estado, cancelar retorna SCAN_FINISHING; a transação mantém sua atomicidade e ainda revalida a autorização. Cancelamento confirmado antes da publicação preserva índice/relatório anteriores. Operações de I/O bloqueadas e a validação inicial podem atrasar a confirmação, sem bloquear as consultas de status.

A UI faz polling a cada 400 ms após a resposta anterior, sem sobrepor consultas. Versões de requisição invalidam respostas anteriores a iniciar/cancelar; desmontar interrompe o polling e ignora respostas pendentes. Falha de consulta mantém o último estado conhecido e informa incerteza. Ao observar um término, a UI recarrega fontes/relatório uma vez. A barra é indeterminada porque não existe total confiável sem novo percurso; ações de fonte não recebem busy global durante o scan.

O schema permanece 2. Reiniciar o processo limpa somente o slot volátil e não dispara scan; o último índice confirmado continua no banco. Recarregar a tela recupera o job do mesmo processo. Reinício após cancelamento/falha é explícito, a partir da raiz; histórico de jobs, pausa/retomada incremental e RNF-010 continuam pendentes. ADR 0005, **proposto**, registra decisões/limites; T-007/T-041/T-042 verificam backend e UI.

## Rastreabilidade e limites

MVP-001/002 estabelecem a fundação; MVP-003 atende RF-001 para pastas locais. T-001/T-014 e T-032/T-033/T-034 cobrem consentimento, persistência, revogação, tokens e contratos. T-035 registra a inspeção nativa anterior, com limites reais. T-008 agora cobre o índice da fixture após reabrir; ideias continuam pendentes. Os resultados históricos permanecem no documento de testes.

Nenhum schema SQL foi entregue no pacote original; as migrações 001/002 são implementações novas derivadas da seção 04. UUIDs e caminhos são gerados/validados no Rust. Ainda não há reconciliador, identidade estável do SO, edição de hierarquia entre fontes, detecção de ciclos de vínculos pessoais ou conteúdo de notas. Essas invariantes devem preceder suas respectivas escritas. Bytes já mantêm representação decimal sem perda no IPC.
