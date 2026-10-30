# ADR 0002 — SQLite local e migração inicial

Data: 2026-10-29

Status: **proposto**

## Contexto

O usuário autorizou implementar apenas MVP-002 / RNF-004: conexão SQLite, migração e testes de persistência. O SQL mencionado na especificação não foi recebido. Não há ainda autorização de fontes, scanner ou editor de ideias.

## Opções comparadas

- `rusqlite` com SQLite incorporado: operações internas pequenas e tipadas no Rust, sem exigir SQLite instalado no Windows.
- Biblioteca SQLite do sistema: mais dependência do ambiente e de opções de compilação, incluindo FTS5.
- Plugin SQL com acesso pelo frontend: desnecessário para um único diagnóstico e amplia a superfície de comandos.

## Decisão proposta e incremento autorizado

Usar `rusqlite 0.41.1` com feature `bundled` e SQLite 3.54.1; sem servidor, credenciais, API remota ou cobrança por serviço. A dependência aumenta o tamanho/tempo de compilação local e usa o toolchain C++ já verificado no Windows. A compatibilidade foi testada neste ambiente; outras plataformas continuam não testadas.

Persistir `mnexo.sqlite3` no diretório local de dados do aplicativo, obtido pelo Tauri. O frontend não escolhe o caminho nem executa SQL. Abrir uma conexão curta por diagnóstico em `spawn_blocking`, com timeout de lock de 2 segundos e FKs habilitadas explicitamente.

A migração 001 cria apenas `sources` e `nodes`, com FKs, índices e checks básicos derivados da seção 04. Fonte nova fica desabilitada por padrão; a aplicação não insere fontes ou nós neste ticket. `knowledge_items`/FTS sincronizado, vínculos, tags e jobs ficam nos seus próprios incrementos. FTS5 é provado por consultas sobre dados sintéticos em testes, sem semear dados de demonstração no banco real.

Usar `user_version` para migrações numeradas e `application_id` provisório MNEX para distinguir o banco do protótipo. Executar DDL, identificação e avanço de versão na mesma transação IMMEDIATE, com versão relida depois do lock. Recusar bancos desconhecidos ou mais novos, preservando-os. Não interpretar o identificador como proteção contra adulteração maliciosa.

## Consequências e limites

A interface informa `ready` com schema inteiro ou `unavailable` com schema nulo, sem caminho ou erro interno. O botão existente refaz a tentativa. Sem pool ou conexão mantida no webview; o custo de abertura por consulta será reavaliado quando houver carga real.

Os checks iniciais não substituem serviço de domínio: UUIDs, normalização de caminhos, ciclos longos, pais de mesma fonte e exatamente um conteúdo por ideia devem ser resolvidos antes de expor essas escritas. A-010 (criptografia) continua aberta.

## Rollback

Falhas de migração revertem DDL, alterações e versão na transação. Não há rotina para excluir/recriar banco ou fazer downgrade. Reverter o código ao MVP-001 preserva o banco, pois esse incremento anterior não o acessa. A migração 001 só inicializa um banco vazio; migrações futuras com dados relevantes exigem backup consistente e testes de restauração antes da liberação.

## Referências

- <https://docs.rs/rusqlite/0.41.1/rusqlite/struct.Connection.html>
- <https://docs.rs/rusqlite/0.41.1/rusqlite/struct.Transaction.html>
- <https://www.sqlite.org/pragma.html>
- <https://www.sqlite.org/fts5.html>
- <https://docs.rs/tauri/2.12.5/tauri/path/struct.PathResolver.html>
