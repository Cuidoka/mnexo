# Arquitetura — estado do MVP-003

Fonte da proposta completa: seção 03 de `../ESPECIFICACAO_COMPLETA.md`. Este documento registra apenas o incremento implementado e não substitui a especificação.

## Fluxo implementado

React → `src/shared/api/app-status.ts` → IPC Tauri `get_app_status` → worker de bloqueio → armazenamento SQLite → struct Rust serializada em camelCase → validação de contrato TypeScript → status na tela Fontes.

O comando não recebe argumentos de usuário. O Tauri resolve um caminho interno fixo; o worker abre o banco, habilita chaves estrangeiras, aplica a migração e consulta a versão. O caminho, erros internos e SQL não são serializados ou logados. `appVersion` vem de `CARGO_PKG_VERSION`. Não há chamadas de rede, enumeração de fontes ou indexação simulada.

Contrato implementado, verificado pela fixture compartilhada de T-025:

```json
{
  "appVersion": "0.1.0",
  "backendStatus": "ready",
  "databaseStatus": "ready",
  "schemaVersion": 1,
  "assistantStatus": "disabled"
}
```

Em falha de armazenamento, `databaseStatus` é `unavailable` e `schemaVersion` é `null`; `backendStatus` continua `ready` porque o IPC respondeu. A UI mostra banco indisponível e permite nova tentativa. O TypeScript rejeita combinações inconsistentes e versões não inteiras, negativas ou sem precisão segura. Alterações do contrato exigem atualização conjunta dos tipos, fixtures, testes e documentação.

## Persistência do MVP-002

- `rusqlite 0.41.1`, feature `bundled`: SQLite 3.54.1 incorporado, sem plugin SQL no frontend.
- Arquivo interno `app_local_data_dir()/mnexo.sqlite3`; no Windows, diretório local por usuário do identificador `com.mnexo.desktop`.
- Abertura por consulta de status, em `spawn_blocking`; conexão curta, espera de lock limitada a 2 segundos. Falhas transitórias podem ser reavaliadas pelo botão existente.
- Migração numerada 001, `BEGIN IMMEDIATE`, versão relida sob lock, DDL e `user_version` na mesma transação. Reexecução não duplica tabelas nem registros.
- `application_id = 0x4d4e4558` identifica provisoriamente bancos deste protótipo. Isso não é autenticação criptográfica. Arquivo inválido, versão futura ou banco não reconhecido é recusado sem recriação.
- Tabelas `sources` e `nodes` em modo STRICT; FKs de fonte/pai com RESTRICT, checks de origem/tipo/tamanho, unicidade de caminho por fonte e índices de fonte/pai. O default de fonte continua `enabled = 0`; o MVP-003 grava `enabled = 1` somente após confirmação. A aplicação ainda não insere nós de índice.
- FTS5 foi exercitado na biblioteca compilada por um índice de texto sintético isolado dos bancos do aplicativo. `knowledge_items`, `knowledge_fts` e seus triggers não foram antecipados.

`Pronto` indica abertura, identificação, migração e estrutura mínima disponíveis; a UI não realiza auditoria integral do catálogo a cada consulta. `integrity_check` e `foreign_key_check` foram exercitados nos testes. O banco segue as permissões do perfil do SO; criptografia (A-010) continua aberta.

SQL e escolhas de conexão estão registrados no ADR 0002, **proposto**, dentro do incremento autorizado. A primeira migração cria somente uma base vazia. Não existe downgrade destrutivo nem atualização para schema >1; backup consistente deve preceder futuras migrações sobre dados relevantes.

## Fronteira de segurança

`src-tauri/build.rs` declara os seis comandos de aplicação em `AppManifest::commands`, que gera as permissões específicas durante o build. A capability `main`, vinculada somente à janela `main`, concede status e os cinco comandos de fontes descritos abaixo. Não há permissões genéricas dos plugins nem origens remotas. Arquivos de permissões gerados são ignorados pelo Git.

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

`FolderSelection`: `{selectionToken, rootPath, displayName}`. `ScanSource`: `{id, rootPath, displayName, authorized, createdAt}` em camelCase, com fixtures compartilhadas Rust/TS. Erros retornam apenas `{code}` conhecido; a UI traduz os códigos sem exibir mensagens internas. Cancelar a confirmação invalida o token no backend; falha ao salvar também o consome, exigindo nova seleção.

O cadastro usa a tabela `sources` existente, sem alterar schema 1. A chave de deduplicação é `root_path` canônico; `INSERT ... ON CONFLICT` preserva UUID e data de criação ao reautorizar. `enabled` representa autorização de metadados, não job em execução. Revogar é `UPDATE enabled=0`; não há deleção, enumeração da pasta nem cascata. A listagem consulta apenas SQLite, permitindo revogar uma pasta que ficou indisponível.

No Windows o banco mantém a sintaxe canônica de caminho longo; a UI recebe o caminho local sem o prefixo técnico. O caso de alias com maiúsculas/Unicode foi exercitado no filesystem desta máquina. Não se usa lowercase irrestrito nem se promete identidade persistente após renomear/mover diretórios. A identidade universal da fonte é o UUID emitido pelo Rust.

O picker nativo permanece uma interface do SO sob controle do usuário. `set_can_create_directories(false)` tem efeito documentado apenas no macOS; não representa bloqueio dos comandos de shell do diálogo Windows. O aplicativo não implementa nem automatiza escrita nas fontes. Detalhes e limites: ADR 0003, **proposto**.

## Rastreabilidade e limites

MVP-001/002 estabelecem a fundação; MVP-003 atende RF-001 para pastas locais. T-001/T-014 e T-032/T-033/T-034 cobrem consentimento, persistência, revogação, tokens e contratos. T-035 registra a inspeção nativa, com limites reais. T-008 continua parcial, sem índice/ideias. Os resultados de fundação e suas ressalvas históricas continuam no documento de testes.

Nenhum schema SQL foi entregue no pacote original; o SQL 001 é uma implementação nova derivada da seção 04. UUIDs e caminhos canônicos das fontes agora são gerados/validados no Rust. Ainda não há reconciliador, identidade estável do SO, hierarquia de nós entre fontes, detecção de ciclos longos ou conteúdo de notas. Essas invariantes devem ser implementadas antes das respectivas escritas. O banco guarda inteiros de 64 bits; futuros DTOs de tamanho precisam manter a representação decimal sem perda indicada na especificação.
