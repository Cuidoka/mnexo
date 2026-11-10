# ADR 0005 — Progresso, status e cancelamento

Data: 2026-11-09

Status: **proposto**

## Contexto e escopo autorizado

MVP-005 / RNF-002 exige acompanhamento e cancelamento sem bloquear a interface. MVP-004 já executa I/O em worker, mas seu IPC aguarda a conclusão e bloqueia ações na tela Fontes. A autorização permanece restrita à fixture sintética; o ticket não amplia o scanner a fontes pessoais nem antecipa navegação 2D.

## Opções e decisão proposta

Manter uma única chamada longa não permite consultar/cancelar por identidade de execução. Jobs persistentes, fila e histórico exigiriam migração e recuperação que não são necessárias a este incremento. Implementa-se um slot em memória por processo, com o último job e somente um ativo, e três comandos estreitos: iniciar por sourceId, consultar o slot e cancelar por jobId. A restrição de concorrência também vale enquanto aguarda cancelamento e durante publicação. O comando anterior `index_fixture_source` deixa de existir para não contornar esse controle.

`start_scan` reserva o slot com UUID e retorna imediatamente, sem abrir SQLite nem enumerar diretórios. Um worker monitorado valida autorização/raiz e executa o scanner. Fonte inválida/revogada/fora da fixture termina como failed com código público, sem percorrê-la. Uma falha do worker também termina como failed. Status/cancelamento operam somente em mutex curto do slot, sem I/O sob o lock. Não se promete exclusão mútua entre múltiplos processos independentes.

Os estados são running, cancelling, publishing, completed, cancelled e failed. O pedido de cancelamento muda running para cancelling; somente a saída do worker por checkpoint confirma cancelled. Checkpoints verificam cancelamento e autorização entre operações de enumeração/metadados. Uma chamada do filesystem em curso não é interrompida à força; a validação inicial da raiz e espera de lock SQLite também podem atrasar o reconhecimento. Isso é cancelamento cooperativo, sem garantia de latência absoluta.

Antes de publicar, o mesmo mutex decide entre cancelamento pendente e publishing. Depois de publishing, `cancel_scan` responde SCAN_FINISHING em vez de prometer rollback de um COMMIT. A publicação segue transacional, com autorização revalidada no SQLite. Um cancelamento reconhecido antes dessa fronteira descarta todo o trabalho em memória e conserva índice/relatório anteriores. Revogar a fonte continua podendo impedir a publicação. Falha ao publicar conserva a atomicidade já testada no MVP-004.

## Contrato e interface

`ScanJob` tem jobId, sourceId, state, progress e errorCode. `progress` contém visitedEntries, filesCount, foldersCount, totalBytes (string decimal), skippedCount e errorCount. Visitas incluem entradas ignoradas; contagens são observações parciais do percurso e não substituem o relatório publicado. Não há caminho atual, conteúdo, SQL nem mensagem interna no status. Falhas são códigos traduzidos na UI. A fixture compartilhada Rust/TS verifica camelCase e precisão.

A UI consulta a cada 400 ms, agendando a próxima consulta após a resposta anterior. Faz invalidação das consultas anteriores ao iniciar/cancelar e ignora respostas após desmontagem. Falha de polling conserva o último estado conhecido e informa incerteza; não inventa conclusão ou fracasso do job. O relatório é relido do SQLite uma vez por término observado. O painel não aplica o busy global das ações de fonte durante o percurso; selecionar, listar e revogar continuam acessíveis.

Como não existe total confiável sem um segundo percurso, a barra é indeterminada, acompanhada de contagens reais, sem percentuais fabricados. Scans muito curtos podem concluir antes de uma consulta intermediária. Apenas o botão de iniciar novo scan é bloqueado enquanto houver job ativo; cancelar é oferecido em running, sem repetir pedido em cancelling e sem oferta em publishing.

## Persistência, reinício e limites

Schema 2 e contratos de fonte/relatório são mantidos. Reiniciar o processo limpa o slot; o último índice/relatório confirmado continua no banco, sem scan automático. Recarregar apenas a tela no mesmo processo recupera o slot. Nova tentativa após cancelamento/falha começa da raiz, explicitamente pelo usuário. Pausa, retomada por checkpoint, histórico persistente, watcher e indexação incremental pertencem a RNF-010 e outros tickets.

Sem dependências, endpoints de produto, serviços de IA, custo remoto ou permissões genéricas novas. Fontes e dados não são enviados. A publicação de código no GitHub é uma tarefa de desenvolvimento autorizada separadamente, incluindo merge das PRs após validação; não faz parte do aplicativo.

Reverter o código para MVP-004 preserva schema 2 e dados. Não limpar o banco ou fontes para reverter. O comportamento não protege contra mutações hostis do filesystem entre verificações, limite já documentado no ADR 0004.

## Referências verificadas

- <https://v2.tauri.app/develop/calling-rust/>
- Implementação instalada de `tauri 2.12.5`, `src/async_runtime.rs`, conferida no lockfile/cache local.
- <https://react.dev/reference/react/useEffect>
- <https://testing-library.com/docs/using-fake-timers/>
