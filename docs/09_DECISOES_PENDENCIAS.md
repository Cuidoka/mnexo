# Decisões e pendências

Origem: seção 09 de `../ESPECIFICACAO_COMPLETA.md`, recebida em 29/10/2026. Os arquivos modulares não vieram no pacote. Este registro distingue a autorização de um incremento da aprovação de propostas gerais.

## Confirmado na especificação recebida

| Código | Registro                                                                |
| ------ | ----------------------------------------------------------------------- |
| D-001  | Um software reúne arquivos e conhecimento pessoal                       |
| D-002  | Estética digital e holográfica 3D                                       |
| D-003  | Pastas representadas por objetos compostos por seus arquivos            |
| D-004  | Navegar, ampliar, selecionar, isolar visualmente e reintegrar elementos |
| D-005  | Área própria para criar e organizar ideias                              |
| D-006  | Integração opcional de IA por chave configurável                        |

Em 29/10/2026, o usuário autorizou iniciar o **MVP-001**, após apresentação da análise e do plano da Etapa 0. A implementação desse incremento não aprova automaticamente os demais tickets ou propostas.

Na sequência, o usuário autorizou explicitamente o **MVP-002 — SQLite com migração e testes de persistência**. Essa autorização inclui a persistência no diretório próprio do aplicativo conforme o plano; não autoriza seleção, varredura ou envio de fontes pessoais.

## Propostas técnicas

Em 09/11/2026, o usuário autorizou **MVP-006 / RF-006**: árvore/lista 2D, breadcrumbs e painel de metadados reais. A implementação consulta os snapshots confirmados do catálogo e mantém o scanner restrito à fixture; não autoriza novos índices pessoais, conteúdo, 3D ou tarefas seguintes. A base é a main `af4ec1e`, com PR #2 do MVP-005 integrada.

Em 09/11/2026, o usuário autorizou **MVP-005 / RNF-002**: progresso, status e cancelamento do scan. Também solicitou que a IA passe a aceitar/integrar as PRs no GitHub; informou já ter integrado manualmente a PR anterior. A PR #1 está na main (`08bf305`), verificada por fetch. O fluxo passa a ser validação, commit detalhado, push, abertura e merge da PR, respeitando os checks/regras do repositório. Isso não concede autorização para começar o ticket seguinte.

Em 09/11/2026, o usuário autorizou **MVP-004 / RF-002**: indexar somente metadados de uma pasta de fixture autorizada, com contagens e relatório de erros. Também solicitou commit detalhado e push ao GitHub em cada passo concluído daqui em diante. A autorização não abrange iniciar novos incrementos, indexar pastas pessoais, ler conteúdo ou enviar dados privados.

Em 09/11/2026, o usuário autorizou o **MVP-003 / RF-001**: selecionar e autorizar uma pasta, persistindo a fonte sem scan automático. O incremento inclui revogação não destrutiva, conforme o requisito confirmado RF-001. Essa autorização não estende o escopo a indexação, conteúdo ou envio remoto.

P-001 (Windows primeiro) e P-002 (Tauri/Rust/React) estão sendo exercitados neste protótipo autorizado. A escolha definitiva de arquitetura continua sujeita à validação; ver ADR 0001, **proposto**.

O uso de SQLite foi autorizado para o MVP-002 (parte de P-003). O desenho específico do schema, driver e migrações está documentado nos ADRs 0002/0004, **propostos**; FTS5 foi validado em testes, sem busca do produto. As demais propostas de P-003 e P-004 a P-010 mantêm seu estado original. Não há aprovação de provedor/modelo de IA, envio de dados, integração de chave, indexação de fontes pessoais ou bibliotecas 3D neste incremento.

## Pendências

- A-001 a A-012 continuam abertas conforme a especificação consolidada; nome, identidade e distribuição não foram decididos.
- O SQL citado pela seção 04 não existe no pacote recebido; o MVP-002 criou sua própria migração 001 mínima, sujeita à evolução documentada, sem alterar o original consolidado.
- RF-001 está implementado para pastas locais: seleção nativa, confirmação, persistência e revogação. T-001 cobre a autorização persistida; T-014 cobre revogação preservando o arquivo e o cadastro (ideias/vínculos ainda não existem como funcionalidade). T-008 continua parcial. T-032 a T-035 complementam a cobertura de fontes; os demais testes do produto permanecem no escopo dos respectivos tickets.
- No MVP-003, caminhos de rede e raízes reparse/symlink são recusados; a remoção permanente do cadastro/índice e o reconciliador de renomeações não foram implementados. O desenho de tokens/caminhos está no ADR 0003, **proposto**.
- RF-002 está implementado somente para a fixture local fixa do MVP-004, preparada e autorizada explicitamente. O backend impede indexar outras fontes. Datas, hierarquia, tamanhos/contagens, erros recuperáveis e relatório persistido compõem este incremento; não significa conclusão de RF-002 para pastas pessoais.
- ADR 0004 mantém **propostos** a política de exclusões/limites, o caminho de fixture vinculado ao checkout e o snapshot identificado por UUID. Não há garantia contra troca maliciosa de ancestrais entre chamadas do filesystem; ampliar o escopo exige revisar essa fronteira.
- RNF-002 ganha job assíncrono, acompanhamento e cancelamento cooperativo no MVP-005. T-007 define reinício explícito do zero após cancelamento; não representa pausa/retomada incremental nem conclusão de RNF-010. O slot em memória, polling e fronteira de publicação estão no ADR 0005, **proposto**. A indexação continua restrita à mesma fixture autorizada, sem nova migração.
- RF-006 passa a ter consulta 2D dos nós filesystem de uma fonte habilitada com snapshot confirmado: caminho, tipo, tamanho, datas, pai e origem, incluindo indicação de índice salvo/parcialidade. A lista hierárquica/breadcrumbs não constituem cena 3D nem abertura de arquivos. O contrato paginado e a política de snapshot/autorização estão no ADR 0006, **proposto**; schema permanece 2.
- Persistência de ideias com conteúdo, FTS do produto, backups/restauração, identidade de filesystem e validações de hierarquia entre fontes/ciclos longos continuam pendentes antes dos tickets que expuserem essas operações.
- O repositório na pasta do usuário é distinto do novo repositório local MNEXO; nenhuma configuração desse repositório externo foi modificada.
