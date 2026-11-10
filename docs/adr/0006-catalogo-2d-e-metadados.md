# ADR 0006 — Catálogo 2D, breadcrumbs e metadados

Data: 2026-11-09

Status: **proposto**

## Contexto autorizado

MVP-006 / RF-006 pede navegação 2D com contexto verificável do item. O schema 2 já contém nós, pais, metadados e scan_id do último relatório. Há linhas retidas de scans anteriores; ler simplesmente todos os nós por fonte misturaria versões. O scanner de produção permanece limitado à fixture. Este incremento não abre conteúdo, não resolve identidade por caminhos enviados pela UI e não antecipa 3D.

## Alternativas e decisão proposta

Enviar a árvore completa simplificaria a tela, mas ampliaria custo e acoplamento; abrir caminhos do disco durante a navegação confundiria snapshot e estado atual. Implementa-se lista hierárquica de filhos, paginada, com breadcrumbs e detalhes por ID, consultando somente SQLite em worker. Usa-se o schema existente, sem migração ou dependência nova.

`get_node_children` recebe sourceId, scanId, folderId (null para raiz), cursor UUID opcional e limit. Retorna NodePage com folder (NodeDetail), breadcrumbs, items (NodeSummary) e nextCursor. `get_node_detail` recebe sourceId, scanId e nodeId e retorna NodeDetail. O TypeScript usa páginas de 50; o Rust rejeita limites fora de 1–100 e consulta no máximo limit+1 para detectar a próxima página.

NodeSummary contém id, parentId, kind file/folder, title, sizeBytes decimal ou null, sizePartial e modifiedAtMs decimal assinado ou null. NodeDetail acrescenta sourceId, scanId, indexedAt, sourceName, sourceRootPath, path, createdAtMs e parent (breadcrumb ou null). IDs são do catálogo/backend; paths são dados para exibição e nunca argumentos para acessar o SO.

O backend valida UUIDs, fonte habilitada e coincidência entre scanId solicitado e último scan_reports. Cada consulta roda numa transação DEFERRED curta, de modo que fonte, relatório, nós e pais pertencem à mesma visão do banco. Depois de nova publicação, uma consulta com o scanId anterior retorna INDEX_CHANGED. Consultas filtram fonte, scan_id, origin filesystem e tipo, sem retornar linhas retidas antigas. Navegação de metadados confirmados não enumera a fonte, mesmo se ficou indisponível; não concede autorização para indexá-la.

Ordenação: pastas antes de arquivos, título com collation BINARY e UUID como desempate. É ordem determinística, sem prometer colação linguística. O cursor externo é somente o último ID; sua chave de ordenação é relida no banco e precisa pertencer à mesma pasta/fonte/snapshot. A paginação usa comparação de tupla, sem OFFSET nem texto de ordenação arbitrário vindo da UI.

Os caminhos armazenados são verificados lexicalmente contra a raiz, sem canonicalização ou I/O da fonte. Breadcrumbs validam pais da mesma fonte/snapshot, tipo pasta, relação de caminho, raiz e ausência de repetição, com no máximo 32 elementos. Corrupção/ciclo/pai cruzado resulta em código público, sem construir uma navegação fictícia. Essa defesa de leitura não constitui reconciliação do filesystem ou validação de futuras escritas entre fontes.

## Comportamento da interface

Explorar é ação explícita de uma fonte autorizada com raiz indexada. Abrir pasta navega pela lista; selecionar arquivo ou Detalhes mostra metadados. Pasta pai e breadcrumbs retornam IDs validados pelo backend. HTML semântico (table, nav e botões) fornece foco/ativação por teclado, sem simular um widget tree incompleto. Carregar mais acrescenta a próxima página, por clique.

Metadados são apresentados como indexados, com data do snapshot e aviso de possível diferença para o disco. Zero não significa indisponível. Datas ficam no horário local; valores fora da faixa de Date são exibidos explicitamente em milissegundos, evitando arredondamento. Uma pasta parcial sem filhos não é anunciada como vazia confirmada.

Requisições têm versões para ignorar detalhe/página adicional atrasados após nova seleção/navegação. Mudança de sourceId/scanId remonta o navegador na raiz; revogar fecha o navegador e bloqueia leituras no Rust, mantendo dados persistidos. Falhas não viram lista vazia. Atualizar catálogo relê fontes/relatórios, sem iniciar scan. Nomes/caminhos são renderizados como texto React, sem HTML executável ou instruções para o agente.

## Limites e rollback

O protótipo possui apenas índices de fixture, mas as consultas podem ler o catálogo confirmado de qualquer fonte habilitada; isso é independente do escopo estrito do scanner e não lê filesystem pessoal. Não há busca, edição, prévia de conteúdo, abertura no SO, expansão recursiva automática, estado de navegação persistido, identidade estável do SO ou 3D. Metadados de ideias/memórias permanecem em seus tickets.

Schema 2 é mantido. Reverter o código para MVP-005 preserva fontes, índice, relatórios e autorização. Não remover registros ou arquivos para reverter. T-003/T-004/T-008/T-009 e T-044 a T-048 cobrem o incremento; resultados e limites nativos ficam no relatório de testes. Nenhum serviço/modelo/endpoint de produto, custo remoto ou permissão genérica foi acrescentado.

## Referências verificadas

- <https://www.sqlite.org/rowvalue.html>
- <https://www.sqlite.org/lang_transaction.html>
- <https://react.dev/reference/react/useEffect>
