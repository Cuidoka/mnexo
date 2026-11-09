# ADR 0003 — Seleção e autorização de fontes

Data: 2026-11-09

Status: **proposto**

## Contexto e escopo autorizado

O usuário solicitou MVP-003 / RF-001: selecionar e autorizar uma pasta e persistir a fonte sem scan automático. RF-001 prevê revogar a autorização. SQLite e a tabela `sources` já existem; não é necessário migrar o schema para este incremento.

## Opções comparadas

- Receber caminhos livres pelo IPC: simples, mas não comprova origem no diálogo e amplia o acesso do frontend.
- Seleção e gravação em um único clique: não permite revisar o escopo antes de persistir.
- Diálogo nativo no Rust, seleção temporária e confirmação por token: opção implementada no incremento autorizado.

## Decisão proposta

Usar `tauri-plugin-dialog 2.8.4` pelo backend, sem conceder sua API genérica ao webview. O plugin usa interfaces locais do SO, sem serviço remoto/cobrança de API, e é compatível com o Tauri 2 utilizado. Acrescenta dependências locais (incluindo filesystem transitivo); nenhuma permissão FS é adicionada à capability.

O backend valida uma pasta local, canonicaliza seu caminho e emite UUID v4 aleatório para a seleção pendente. Apenas uma seleção/picker fica ativa por processo. Cancelar, abrir nova escolha, confirmar ou encerrar o processo invalida a seleção correspondente. O token não é persistido. Confirmar exige token válido e revalidação da raiz, sem aceitar caminho ou nome enviado pelo frontend.

Persistir uma fonte com UUID v4 do backend; reutilizar ID/data da linha em conflito de caminho canônico. Não fazer lowercase global de caminhos, que poderia fundir diretórios distintos em filesystems com sensibilidade a caixa. Revogar muda `enabled` para falso, mantendo metadados e vínculos; reautorizar exige nova seleção e confirmação. Não remover fisicamente arquivos nem apagar cadastro/índice neste ticket.

## Consequências e limites

Não há enumeração de filhos, leitura de conteúdo, scanner, watcher ou rede. A autorização é de metadados da raiz; conteúdo e envio continuam separados. Listar/revogar consulta somente o banco.

Raízes symlink/reparse e caminhos UNC são recusados nesta versão. A canonicalização pode resolver links intermediários; o caminho exibido e confirmado é o destino canônico. UUID é identidade do domínio, enquanto caminho continua sendo a chave de reconciliação inicial; renomeações e identificação estável do SO ficam para RF-011. A revalidação não substitui as proteções contra escape/TOCTOU que o futuro scanner precisará aplicar em cada acesso.

O token limita proveniência do caminho e replay dentro do processo; não é uma comprovação criptográfica de clique nem protege uma UI já comprometida. A integridade do bundle/CSP continua parte do modelo de confiança. O picker Windows é uma interface do SO: o plugin não garante desabilitar seus comandos de gerenciamento de arquivos; o aplicativo não os automatiza ou oferece no frontend.

## Rollback

Sem alteração de schema: voltar ao código anterior preserva `sources` e seus estados, mas não oferece a UI para gerenciá-los. Não limpar o banco para reverter o código. Cancelar uma escolha não grava; revogar preserva a linha e os arquivos. Na branch `codex/mvp-003`, o ponto de partida é o commit existente `7e58551`; não há commit automático desta entrega.

## Referências

- <https://v2.tauri.app/plugin/dialog/>
- <https://docs.rs/tauri-plugin-dialog/2.8.4/tauri_plugin_dialog/struct.FileDialogBuilder.html>
- <https://doc.rust-lang.org/std/fs/fn.canonicalize.html>
- <https://v2.tauri.app/security/capabilities/>
