# MNEXO

Aplicativo desktop em desenvolvimento para conectar arquivos reais e conhecimento pessoal em um universo espacial. O nome do produto permanece provisório.

## Estado real

Incremento atual: **MVP-007 / RF-003 — cena 3D com nós reais do índice**. A tela Fontes permite abrir uma cena de pastas contendo seus filhos, com câmera fixa e até 100 nós do mesmo snapshot, além da navegação 2D e metadados anteriores. A indexação da fixture continua explícita, em segundo plano, com progresso/cancelamento.

O banco possui `sources`/`nodes` e as tabelas de relatório. O comando retorna `databaseStatus: "ready"` e `schemaVersion: 2` quando o banco está disponível; em falha retorna `"unavailable"` e `null`. A interface distingue falha do banco de falha IPC e permite tentar novamente. IA continua `"disabled"`.

Indexação de pastas pessoais, pausa/retomada incremental, edição de ideias, busca do produto, navegação interativa 3D e integração de IA **ainda não estão implementados**. Autorizar não inicia varredura. FTS5 foi exercitado com texto sintético em bancos de teste; o índice de ideias do produto fica para seu ticket próprio.

## Adicionar e revogar uma fonte

1. Na janela desktop, aguarde o banco ficar “Pronto” e clique **Selecionar pasta**.
2. Escolha uma pasta local existente no diálogo do Windows.
3. Revise o caminho mostrado e clique **Autorizar pasta**, ou **Cancelar autorização** para descartar a seleção.
4. A fonte aparecerá como **Autorizada para metadados**. Fechar/reabrir carrega a lista do SQLite, sem consultar o conteúdo das pastas.
5. **Revogar autorização** desabilita a fonte e mantém a linha como revogada; não apaga arquivos ou registros vinculados. Para autorizar novamente, selecione a pasta outra vez.

A autorização é para metadados dessa raiz. Leitura de conteúdo e envio remoto continuam separados e indisponíveis. Cancelar o diálogo ou a confirmação não persiste uma fonte. Selecionar novamente o mesmo caminho canônico reutiliza o ID; nenhuma fonte é adicionada na inicialização.

Escopo atual: pastas locais; caminhos UNC/de rede e raízes que sejam links simbólicos/junções são recusados. Não há leitura de conteúdo nem remoção permanente do cadastro. A raiz é validada antes da confirmação e novamente antes da gravação. Links intermediários podem ser resolvidos pela canonicalização na seleção; o scanner da fixture também recusa links nos ancestrais. Renomeações e identidade estável do filesystem continuam no RF-011.

## Indexar e cancelar a fixture (MVP-004/005)

1. Na raiz do projeto, execute `pnpm fixture:prepare`. O script cria somente dados sintéticos em `.tools/fixtures/mvp-004`, incluindo uma pasta vazia e um arquivo de zero bytes. Arquivos já existentes são preservados.
2. No aplicativo desktop, selecione exatamente essa pasta e confirme **Autorizar pasta**. A autorização não inicia indexação.
3. Clique **Indexar metadados da fixture**. O backend recebe apenas o ID e recusa outras raízes, inclusive fontes pessoais já autorizadas.
4. Acompanhe **Andamento da indexação**: entradas visitadas, arquivos/pastas, bytes, ignoradas e ocorrências. O total da árvore ainda é desconhecido, então a barra é indeterminada, sem percentual estimado. A tela continua permitindo consultar fontes e revogar autorização.
5. **Cancelar varredura** solicita interrupção. Aguarde **Varredura cancelada**: a solicitação não interrompe à força uma chamada do filesystem já em curso. O trabalho incompleto é descartado e o índice/relatório anteriores permanecem.
6. Em **Salvando o índice**, a publicação já começou e não aceita cancelamento. Ao concluir, confira o relatório persistido, inclusive erros/exclusões se parcial.
7. Uma nova execução começa da raiz, por novo clique. Fechar/reabrir o processo limpa o estado volátil do job, carrega o último relatório salvo e não inicia scan. Repetir o clique preserva IDs dos caminhos conhecidos.

Existe apenas um job ativo por processo, incluindo o período em que aguarda confirmação de cancelamento ou grava o resultado. Recarregar a tela no mesmo processo recupera esse job. Jobs e progresso não possuem histórico persistente; pausa e retomada por checkpoint pertencem à evolução de RNF-010. O schema continua **2**, sem migração nova no MVP-005.

Com a fixture recém-criada: **3 arquivos, 3 pastas e 41 bytes** (25 + 16 + 0, conferidos no filesystem). Se você modificar os dados sintéticos, as contagens refletem a árvore atual. Nenhum conteúdo é lido pelo scanner: somente nome, tipo arquivo/pasta, caminho, hierarquia, tamanho e datas de criação/modificação.

Limites desta etapa: 1.000 entradas incluindo raiz, profundidade 16 e orçamento de 5 segundos verificado entre operações locais. Uma chamada bloqueada do filesystem não é interrompida por esse orçamento. Links/reparse points, entradas ocultas/de sistema/offline, nomes iniciados por ponto e diretórios de dependências/cache são ignorados e relatados; os totais ficam parciais. A amostra contém até 100 ocorrências, com contagem total separada. Não há estimativa da quantidade de descendentes não visitados. A fixture fica vinculada ao caminho deste checkout na compilação; após mover o projeto, prepare-a e recompile. Limites e desenho proposto: ADR 0004.

Os requisitos do produto permanecem em [ESPECIFICACAO_COMPLETA.md](ESPECIFICACAO_COMPLETA.md). As decisões expressamente confirmadas estão registradas em [docs/09_DECISOES_PENDENCIAS.md](docs/09_DECISOES_PENDENCIAS.md). Este README descreve comportamento observado na implementação; não transforma propostas técnicas em requisitos aprovados.

## Explorar o índice 2D (MVP-006)

1. Em uma fonte autorizada que já tenha um índice navegável, clique **Explorar índice 2D**. A consulta lê o SQLite; abrir o catálogo não inicia varredura.
2. A lista mostra os filhos da pasta atual, com pastas antes de arquivos. Clique no nome de uma pasta para entrar, no breadcrumb para voltar a um ancestral ou em **Voltar à pasta pai**.
3. Selecione um arquivo ou clique **Detalhes** para consultar caminho indexado, tipo arquivo/pasta, tamanho lógico, datas, pasta pai, fonte e data do índice. O item atual e sua origem vêm do backend, por IDs.
4. **Carregar mais itens** traz a próxima página de 50 filhos. O backend limita cada consulta a 100 itens, sem transferir a árvore inteira automaticamente.
5. **Atualizar catálogo** relê fonte/snapshot salvo. Se o índice mudar, a navegação é reiniciada na raiz; se a autorização for revogada, o catálogo deixa de ser exibido. **Fechar índice** encerra só a consulta visual.

São metadados armazenados, não uma confirmação do estado atual do disco. A navegação continua consultando o índice mesmo se um arquivo ficou indisponível depois de indexado, sem tentar abri-lo. Zero bytes e dado indisponível são distintos; pastas/metadados parciais são sinalizados. A parte de árvore 2D é uma lista hierárquica navegável, sem widget de expansão de toda a árvore. Datas são exibidas no horário local; valores fora do intervalo suportado pela UI permanecem explícitos como milissegundos, sem arredondar.

Fonte, snapshot, pasta/item e cursor são validados no Rust em uma transação de leitura consistente. Consultas não retornam nós retidos de snapshots anteriores nem pais de outra fonte. A autorização de navegação cobre o catálogo já confirmado de uma fonte habilitada; a criação de índices continua restrita à fixture neste protótipo. Não há abertura de conteúdo ou comando do SO na navegação. O schema permanece **2**. Decisões e limites: ADR 0006, **proposto**.

## Abrir a cena 3D (MVP-007)

1. Em uma fonte autorizada com índice navegável, clique **Ver cena 3D**. A consulta usa somente o SQLite e não inicia scan.
2. Os contornos verdes representam pastas e contêm os filhos; os blocos azuis representam arquivos. Âmbar sinaliza metadados parciais. A câmera é fixa e enquadra a raiz, inclusive ao redimensionar a janela.
3. Confira contagem real e data do índice. A projeção usa até **100 nós incluindo a raiz** e **3 níveis abaixo dela**, em largura, com pais antes de filhos. Se houver mais itens, a tela informa o limite. Índices menores são exibidos com sua contagem real, sem completar com objetos fictícios.
4. Expanda **Relação dos nós exibidos** para conferir nome, UUID, tipo, pai e bytes exatos. O volume dos arquivos usa escala comprimida; pastas acomodam seus filhos, sem prometer escala física proporcional ao espaço em disco.
5. **Ver índice 2D** abre a navegação existente, também disponível se WebGL 2 falhar. Fechar a cena libera canvas, observador de tamanho, geometrias, materiais e contexto gráfico. Atualizar catálogo relê fonte/snapshot; revogação fecha a cena.

Para preparar um exemplo com pelo menos dez nós, execute `pnpm fixture:prepare:3d`. Ele acrescenta nove arquivos sintéticos à fixture fixa, preservando tudo que já existir. Depois indexe a fixture por clique explícito no aplicativo. Com a fixture original sem alterações, serão **12 arquivos e 3 pastas (15 nós)**. Preparar os arquivos não atualiza o índice automaticamente.

Three.js **0.187.0**, licença MIT, é empacotado localmente; `@types/three` da mesma versão é dependência de desenvolvimento. Não há custo por uso, assets remotos, CDN, rede, modelo ou endpoint de produto. O renderer carrega sob demanda e precisa de WebGL 2 no WebView2. Decisões técnicas, orçamento e limites: ADR 0007, **proposto**. Órbita, zoom e seleção/navegação de objetos ficam no MVP-008; isolar/reintegrar fica no MVP-009.

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

As migrações `001_initial.sql` e `002_metadata_index.sql` são novas, derivadas da especificação; o SQL citado pelo pacote original não foi fornecido. A 002 acrescenta campos de metadados e relatórios, preservando fontes/autorização/nós existentes. A versão (`PRAGMA user_version`) e a identificação provisória do aplicativo (`PRAGMA application_id`, MNEX) são gravadas na mesma transação do schema. Aberturas seguintes preservam os dados e habilitam chaves estrangeiras em cada conexão. Arquivos inválidos, bancos não reconhecidos ou versões mais novas são recusados, sem recriar ou zerar o banco.

Usa `rusqlite 0.41.1` com SQLite incorporado `3.54.1`, sem servidor ou instalação SQLite separada. Operações de abertura/migração rodam em uma tarefa de bloqueio separada da UI, com espera de lock limitada a 2 segundos. Cada tentativa reabre o banco e pode recuperar uma falha transitória.

## Verificar

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:scene:webgl
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

O contrato JSON compartilhado é verificado no Rust e no TypeScript. Os testes do frontend usam mocks explicitamente; não substituem abrir a janela e verificar o IPC real. Cenários e resultados: [docs/08_TESTES_E_CRITERIOS.md](docs/08_TESTES_E_CRITERIOS.md).

`test:scene:webgl` usa Chrome/Edge instalado, em modo headless, perfil novo dentro de `.tools`, servidor somente no loopback e SwiftShader para exercitar WebGL 2 real com 12/100 nós sintéticos e descarte/perda de contexto. Aceita `MNEXO_TEST_BROWSER` para indicar outro executável Chromium. Não usa o perfil pessoal nem o banco/IPC do aplicativo. A imagem e o DOM de evidência ficam em `.tools/scene-webgl-*`; isso não comprova compatibilidade com todos os drivers ou com WebView2 nativo.

Os testes SQLite usam diretórios temporários dentro de `.tools/test-data`, sem arquivos pessoais, e verificam reabertura, Unicode, integridade, FKs, precisão de inteiros, concorrência, rollback, metadados e FTS5 sintético. **T-008** cobre o índice da fixture; a parte de ideias continua pendente. Backup automático e restauração do produto não fazem parte deste incremento.

## Segurança e limites

- `get_app_status` mantém o diagnóstico de versão e banco. As operações de dados do aplicativo são executadas no Rust e concedidas somente à janela `main`.
- Os comandos são estreitos e permitidos somente na janela `main`: status, seleção/autorização/listagem/revogação de fontes, início/status/cancelamento de job e consultas de filhos/detalhes/projeção 3D do índice. Dados entram por token ou IDs; nenhum aceita caminho livre ou SQL vindo do frontend.
- O plugin oficial de diálogo roda pelo Rust; nenhuma permissão genérica de diálogo, filesystem, shell, HTTP ou SQL é concedida ao frontend. Somente a fixture pode ter filhos enumerados, após autorização e clique explícito; não há leitura de conteúdo. O crate filesystem é dependência transitiva do plugin de diálogo, sem permissões concedidas na capability.
- A interface usa recursos empacotados e fontes do sistema, sem CDN, telemetria, endpoints de IA ou chaves.
- A CSP de produção permite conexão IPC local. A CSP de desenvolvimento acrescenta somente o servidor Vite no loopback.
- Instalação de dependências e compilação podem usar rede. Isso é distinto da execução do aplicativo empacotado.

O ícone provisório foi desenhado como SVG no projeto; o ICO é derivado pelo CLI Tauri. Não é identidade visual final aprovada.

## Estrutura e rollback

`src/app` contém a tela, `src/shared/api` encapsula o IPC, `src-tauri/src/commands` contém o contrato Rust, `src-tauri/src/storage` encapsula SQLite e migrações, `src-tauri/migrations` guarda o SQL, `tests/fixtures` guarda somente contratos sintéticos e `docs` registra arquitetura, testes e decisões.

O usuário solicitou, a partir do MVP-004, commit detalhado e push ao GitHub a cada passo concluído; a partir do MVP-005, também criação e merge da PR após validação. Isso não autoriza iniciar incrementos futuros nem ignorar verificações exigidas no GitHub. A PR #1 do MVP-004 foi integrada manualmente pelo usuário; MVP-005/006 entraram pelas PRs #2/#3. O MVP-007 parte da main `836463c`. Os três documentos recebidos e `docs/design` são preservados. O schema continua 2, permitindo reverter o código para MVP-006 sem downgrade. Backup consistente e restauração continuam pendentes.

Próximo incremento mínimo: **MVP-008 / RF-004**, órbita, zoom, seleção e navegação entre filhos/pais na cena 3D.
