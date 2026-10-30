# Arquitetura — estado do MVP-002

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
- Tabelas `sources` e `nodes` em modo STRICT; FKs de fonte/pai com RESTRICT, checks de origem/tipo/tamanho, unicidade de caminho por fonte e índices de fonte/pai. Fontes têm `enabled = 0` por padrão; a aplicação ainda não possui operações de inserção de fontes ou nós.
- FTS5 foi exercitado na biblioteca compilada por um índice de texto sintético isolado dos bancos do aplicativo. `knowledge_items`, `knowledge_fts` e seus triggers não foram antecipados.

`Pronto` indica abertura, identificação, migração e estrutura mínima disponíveis; a UI não realiza auditoria integral do catálogo a cada consulta. `integrity_check` e `foreign_key_check` foram exercitados nos testes. O banco segue as permissões do perfil do SO; criptografia (A-010) continua aberta.

SQL e escolhas de conexão estão registrados no ADR 0002, **proposto**, dentro do incremento autorizado. A primeira migração cria somente uma base vazia. Não existe downgrade destrutivo nem atualização para schema >1; backup consistente deve preceder futuras migrações sobre dados relevantes.

## Fronteira de segurança

`src-tauri/build.rs` declara o comando em `AppManifest::commands`, que gera as permissões específicas desse comando durante o build. A permissão de aplicação `allow-get-app-status` é concedida somente pela capability `main`, vinculada à janela `main`. Apenas essa capability é ativada na configuração. Não são concedidas permissões de plugins ou origens remotas. Arquivos de permissões gerados são ignorados pelo Git.

A CSP permite scripts locais e transporte IPC; a variante de desenvolvimento adiciona o Vite em `127.0.0.1:1420`. Estilos inline são permitidos para compatibilidade com o desenvolvimento Vite; scripts inline arbitrários não são habilitados por essa regra. O contexto do Tauri injeta os próprios hashes/nonces necessários.

Referências verificadas durante a implementação:

- <https://v2.tauri.app/security/capabilities/>
- <https://v2.tauri.app/develop/calling-rust/>
- <https://v2.tauri.app/security/csp/>

## Rastreabilidade e limites

MVP-001 e MVP-002 estabelecem a fundação para RF-001, ainda não satisfeito. RNF-004 é o requisito deste incremento; T-008 tem cobertura parcial de persistência, sem índice/ideias. T-025/T-026 foram atualizados junto com o contrato. T-028 cobre banco limpo/reabertura/FKs, T-029 falhas e rollback, T-030 FTS5 e T-031 a janela com banco local. Resultados ficam no documento de testes.

Nenhum schema SQL foi entregue no pacote original; o SQL 001 é uma implementação nova derivada da seção 04. Ainda não há criação de UUIDs, normalização de caminhos Windows, reconciliação, hierarquia entre fontes validada por serviço, detecção de ciclos longos ou conteúdo de notas. Essas invariantes devem ser implementadas antes de expor as respectivas escritas. O banco guarda inteiros de 64 bits; futuros DTOs de tamanho precisam manter a representação decimal sem perda indicada na especificação.
