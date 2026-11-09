# MNEXO

Aplicativo desktop em desenvolvimento para conectar arquivos reais e conhecimento pessoal em um universo espacial. O nome do produto permanece provisório.

## Estado real

Incremento atual: **MVP-003 / RF-001 — fontes autorizadas**, sobre a fundação e a persistência SQLite. A tela Fontes permite selecionar uma pasta local por diálogo nativo, revisar seu caminho, autorizar, listar e revogar a autorização. As fontes e seu estado são persistidos no banco.

O banco possui a base de catálogo `sources`/`nodes`, inicialmente vazia. O comando retorna `databaseStatus: "ready"` e `schemaVersion: 1` quando o banco está disponível; em falha retorna `"unavailable"` e `null`. A interface distingue falha do banco de falha IPC e permite tentar novamente. IA continua `"disabled"`.

Indexação, edição de ideias, busca do produto, 3D e integração de IA **ainda não estão implementados**. Autorizar não inicia varredura. FTS5 foi exercitado com texto sintético em bancos de teste; o índice de ideias do produto fica para seu ticket próprio.

## Adicionar e revogar uma fonte

1. Na janela desktop, aguarde o banco ficar “Pronto” e clique **Selecionar pasta**.
2. Escolha uma pasta local existente no diálogo do Windows.
3. Revise o caminho mostrado e clique **Autorizar pasta**, ou **Cancelar autorização** para descartar a seleção.
4. A fonte aparecerá como **Autorizada para metadados**. Fechar/reabrir carrega a lista do SQLite, sem consultar o conteúdo das pastas.
5. **Revogar autorização** desabilita a fonte e mantém a linha como revogada; não apaga arquivos ou registros vinculados. Para autorizar novamente, selecione a pasta outra vez.

A autorização é para metadados dessa raiz. Leitura de conteúdo e envio remoto continuam separados e indisponíveis. Cancelar o diálogo ou a confirmação não persiste uma fonte. Selecionar novamente o mesmo caminho canônico reutiliza o ID; nenhuma fonte é adicionada na inicialização.

Escopo atual: pastas locais; caminhos UNC/de rede e raízes que sejam links simbólicos/junções são recusados. Não há varredura, abertura de arquivos ou remoção permanente do cadastro. A raiz é validada antes da confirmação e novamente antes da gravação. Links intermediários podem ser resolvidos pela canonicalização; o caminho confirmado na tela é o destino canônico. Renomeações e identidade estável do filesystem continuam no RF-011.

Os requisitos do produto permanecem em [ESPECIFICACAO_COMPLETA.md](ESPECIFICACAO_COMPLETA.md). As decisões expressamente confirmadas estão registradas em [docs/09_DECISOES_PENDENCIAS.md](docs/09_DECISOES_PENDENCIAS.md). Este README descreve comportamento observado na implementação; não transforma propostas técnicas em requisitos aprovados.

## Pré-requisitos e ambiente

Windows, Microsoft C++ Build Tools com compilador MSVC e Windows SDK, WebView2 Runtime, Node.js >=22.13 e pnpm 10.19.0. Rust precisa incluir rustfmt e Clippy. Requisitos oficiais: <https://v2.tauri.app/start/prerequisites/>.

Ambiente encontrado em 29/10/2026:

| Ferramenta                | Versão                                       |
| ------------------------- | -------------------------------------------- |
| Node.js / pnpm            | 22.16.0 / 10.19.0                            |
| Rust / Cargo              | 1.99.1 / 1.99.1, host x86_64-pc-windows-msvc |
| MSVC / Windows SDK        | 14.44.35207 / 10.0.26100                     |
| WebView2                  | 156.0.4314.50                                |
| Tauri CLI / API JS        | 2.12.4 / 2.12.4                              |
| Tauri Rust / tauri-build  | 2.12.5 / 2.7.4                               |
| React / TypeScript / Vite | 19.3.1 / 5.9.3 / 8.3.5                       |

Dependências exatas resolvidas: `pnpm-lock.yaml` e `src-tauri/Cargo.lock`. O Rust local foi instalado no canal `stable`; sua versão efetivamente testada deve ser conferida acima antes de reproduzir a entrega. Atualizações do canal não são fixadas pelo lockfile Cargo.

## Executar no Windows

Na raiz deste projeto, em PowerShell:

```powershell
# Se usar o Rust instalado localmente pelo projeto:
. .\scripts\Use-LocalRust.ps1

pnpm install --frozen-lockfile
pnpm desktop:dev
```

Com Rust já disponível globalmente no PATH, omita a primeira linha. O script apenas configura o processo atual; não altera configurações permanentes do Windows. A pasta `.tools` e o `node_modules` não são versionados. O pnpm usa cache local em `.tools/pnpm-store`.

Para preparar Rust local em uma nova máquina, consulte <https://rust-lang.github.io/rustup/installation/index.html>: defina `CARGO_HOME` para `.tools/cargo` e `RUSTUP_HOME` para `.tools/rustup`, baixe o `rustup-init.exe` oficial para `.tools/downloads`, confira o SHA-256 publicado e execute com `--no-modify-path --default-host x86_64-pc-windows-msvc --default-toolchain 1.99.1 --profile minimal --component rustfmt,clippy`. Não é necessário instalar ferramentas globalmente para usar este checkout.

`pnpm dev` abre somente o servidor da interface em `http://127.0.0.1:1420`. No navegador, a tela informa que a verificação requer o aplicativo desktop. O servidor de desenvolvimento escuta apenas no loopback.

```powershell
pnpm desktop:build
```

Gera o executável em `src-tauri/target/release/mnexo.exe`. Instaladores, assinatura, atualização automática e distribuição estão fora deste incremento.

## Banco local

Destino fixo do backend: `app_local_data_dir()/mnexo.sqlite3`, normalmente `%LOCALAPPDATA%\com.mnexo.desktop\mnexo.sqlite3` no Windows. A persistência grava somente no diretório próprio do aplicativo. Caminho e SQL não são recebidos do frontend. Não há importação, enumeração ou leitura de fontes pessoais.

A migração `src-tauri/migrations/001_initial.sql` é nova, derivada da especificação; o SQL citado pelo pacote original não foi fornecido. A versão (`PRAGMA user_version`) e a identificação provisória do aplicativo (`PRAGMA application_id`, MNEX) são gravadas na mesma transação do schema. Aberturas seguintes preservam os dados e habilitam chaves estrangeiras em cada conexão. Arquivos inválidos, bancos não reconhecidos ou versões mais novas são recusados, sem recriar ou zerar o banco.

Usa `rusqlite 0.41.1` com SQLite incorporado `3.54.1`, sem servidor ou instalação SQLite separada. Operações de abertura/migração rodam em uma tarefa de bloqueio separada da UI, com espera de lock limitada a 2 segundos. Cada tentativa reabre o banco e pode recuperar uma falha transitória.

## Verificar

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

O contrato JSON compartilhado é verificado no Rust e no TypeScript. Os testes do frontend usam mocks explicitamente; não substituem abrir a janela e verificar o IPC real. Cenários e resultados: [docs/08_TESTES_E_CRITERIOS.md](docs/08_TESTES_E_CRITERIOS.md).

Os testes SQLite usam diretórios temporários dentro de `.tools/test-data`, sem arquivos pessoais, e verificam reabertura, Unicode, integridade, FKs, precisão de inteiros, concorrência, rollback e FTS5. A aprovação de persistência cobre **RNF-004** e parcialmente **T-008**; não significa que índice de arquivos ou ideias já existam. Backup automático e restauração do produto não fazem parte deste incremento.

## Segurança e limites

- `get_app_status` mantém o diagnóstico de versão e banco. As operações de dados do aplicativo são executadas no Rust e concedidas somente à janela `main`.
- Os comandos de fontes são estreitos e permitidos somente na janela `main`: escolha nativa, cancelamento, confirmação por token, listagem e revogação por ID. Nenhum aceita caminho livre ou SQL vindo do frontend.
- O plugin oficial de diálogo roda pelo Rust; nenhuma permissão genérica de diálogo, filesystem, shell, HTTP ou SQL é concedida ao frontend. O filesystem é consultado apenas para validar a raiz escolhida, sem enumerar seus filhos ou ler conteúdo. O crate filesystem é dependência transitiva do plugin de diálogo, sem permissões concedidas na capability.
- A interface usa recursos empacotados e fontes do sistema, sem CDN, telemetria, endpoints de IA ou chaves.
- A CSP de produção permite conexão IPC local. A CSP de desenvolvimento acrescenta somente o servidor Vite no loopback.
- Instalação de dependências e compilação podem usar rede. Isso é distinto da execução do aplicativo empacotado.

O ícone provisório foi desenhado como SVG no projeto; o ICO é derivado pelo CLI Tauri. Não é identidade visual final aprovada.

## Estrutura e rollback

`src/app` contém a tela, `src/shared/api` encapsula o IPC, `src-tauri/src/commands` contém o contrato Rust, `src-tauri/src/storage` encapsula SQLite e migrações, `src-tauri/migrations` guarda o SQL, `tests/fixtures` guarda somente contratos sintéticos e `docs` registra arquitetura, testes e decisões.

Um repositório Git próprio foi inicializado na branch `codex/mvp-001`; não há commit automático. Os três documentos recebidos foram preservados. O rollback deve reverter somente o código deste incremento após revisão, preservando o banco. Não existe downgrade automático: o MVP-001 não lê ou altera SQLite. Migrações com erro revertem sua transação; nenhuma rotina apaga bancos incompatíveis. Antes de uma evolução futura sobre dados relevantes, será necessário implementar backup consistente e testar restauração.

Próximo incremento mínimo: **MVP-004 / RF-002**, scanner somente de metadados de uma pasta de fixture autorizada, com relatório de contagens e erros.
