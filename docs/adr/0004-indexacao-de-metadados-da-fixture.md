# ADR 0004 — Indexação de metadados da fixture

Data: 2026-11-09

Status: **proposto**

## Contexto autorizado

MVP-004 / RF-002 solicita scanner de metadados de uma fixture autorizada, com contagens e erros. A instância já pode conter fontes pessoais autorizadas pelo RF-001; isso não autoriza indexá-las neste incremento. Progresso/cancelamento são MVP-005.

## Opções e decisão proposta

Liberar qualquer fonte autorizada extrapolaria o passo solicitado. Receber um caminho do frontend ampliaria o contrato sem necessidade. Implementa-se `index_fixture_source(sourceId)`, restrito no Rust à `.tools/fixtures/mvp-004` do checkout usado na compilação. Um script separado prepara dados sintéticos, sem sobrescrever existentes; selecionar e autorizar continua exigindo o fluxo nativo do RF-001. A escolha de caminho fixo serve a este protótipo, exige recompilar após mover o checkout e não define distribuição final do produto.

O scanner usa `std::fs::symlink_metadata` e `read_dir`, sem abrir conteúdo e sem novas dependências. Recusa links/reparse nos ancestrais da raiz e ignora links/reparse encontrados nos filhos, sem percorrê-los. A autorização é relida antes de visitar cada entrada e listar diretórios e novamente na transação de publicação. Se revogada, não publica o trabalho incompleto e preserva o snapshot anterior. Listar fontes/relatórios não consulta o filesystem.

Erros de metadados, enumeração ou datas não abortam o restante. Exclusões deliberadas também são ocorrências, tornam os totais parciais e aparecem com códigos públicos traduzidos pela UI. Excluem-se nomes iniciados por ponto, node_modules, target, cache/caches, **pycache** e atributos Windows hidden/system/offline. Essa política conservadora é provisória, sem configuração pelo usuário ainda.

Limites: 1.000 entradas visitadas (incluindo raiz e exclusões), profundidade 16, orçamento de 5 segundos entre chamadas e amostra de 100 ocorrências. Interromper uma chamada bloqueada do filesystem exige trabalho posterior; não se promete timeout rígido. Os totais de arquivos/pastas contam somente nós indexados; pastas incluem raiz e vazias. Bytes de pastas somam arquivos descendentes acessíveis, propagando parcialidade. Entradas ignoradas contam entradas conhecidas descartadas, sem estimar descendentes não visitados. O relatório conta todas as ocorrências observadas, inclusive as que excedem a amostra.

## Persistência e contrato

A migração aditiva 002 preserva tabelas/IDs/autorização existentes e acrescenta datas de filesystem em milissegundos desde Unix epoch, como texto decimal assinado, e campos `size_partial`/`scan_id` em nodes. Datas indisponíveis ficam nulas e são relatadas. `created_at` continua sendo a criação do registro de catálogo.

`scan_reports` guarda o último resultado por fonte; `scan_issues` guarda sua amostra. Nós e relatório são publicados em uma única transação IMMEDIATE, com SQL parametrizado. Falha na gravação reverte ambos. UUIDs vêm do backend. O upsert por fonte/caminho relativo preserva IDs; não há reconciliação de renomeações, identidade de arquivo do SO ou watcher.

Um nó pertence ao snapshot atual somente se `nodes.scan_id = scan_reports.scan_id` para a mesma fonte. Nós antigos são conservados e não entram nas contagens atuais. Isso evita deleção e preserva futuras referências; retenção/limpeza exigem decisão posterior. Não há UI de navegação de nós neste incremento. O backend carrega os metadados limitados em memória antes de publicar; não há banco transacionado durante toda a enumeração.

`ScanSource` acrescenta `fixtureEligible` (somente sugestão visual, validada novamente no comando) e `lastScan` (relatório ou null). `ScanReport` contém sourceId, scanId, completedAt, filesCount, foldersCount, totalBytes, skippedCount, errorCount, partial, issues e issuesTruncated. Tamanhos são i64 no SQLite e strings decimais no IPC para preservar precisão. Ocorrências contêm somente caminho relativo e código conhecido, sem erro interno, SQL ou conteúdo. Os contratos compartilhados Rust/TS são atualizados no mesmo commit.

## Limites e rollback

O worker de bloqueio evita executar I/O na thread do webview, mas não constitui a entrega de status/progresso/cancelamento do MVP-005. Não há isolamento contra mutação hostil entre checagem de caminho e chamada seguinte (TOCTOU); a varredura não é snapshot atômico do filesystem. A liberação para dados pessoais requer revisar handles/identidade, limites e concorrência. Hardlinks de arquivo são contados por caminho, sem abrir conteúdo; espaço físico/deduplicação não são calculados.

Sem modelos, endpoints, serviços remotos, custo de API ou permissões genéricas novas. O aplicativo não grava nas fontes; o script e os testes criam apenas fixtures explícitas. Backup/restauração do produto ainda pendem. Não há downgrade automático: código antigo que só entende schema 1 recusa o banco atualizado; preservar o banco ao reverter código.

## Referências verificadas

- <https://doc.rust-lang.org/std/fs/fn.symlink_metadata.html>
- <https://doc.rust-lang.org/std/fs/fn.read_dir.html>
- <https://doc.rust-lang.org/std/fs/struct.Metadata.html>
- <https://doc.rust-lang.org/std/os/windows/fs/trait.MetadataExt.html>
- <https://www.sqlite.org/lang_altertable.html>
