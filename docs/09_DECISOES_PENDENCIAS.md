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

Em 09/11/2026, o usuário autorizou o **MVP-003 / RF-001**: selecionar e autorizar uma pasta, persistindo a fonte sem scan automático. O incremento inclui revogação não destrutiva, conforme o requisito confirmado RF-001. Essa autorização não estende o escopo a indexação, conteúdo ou envio remoto.

P-001 (Windows primeiro) e P-002 (Tauri/Rust/React) estão sendo exercitados neste protótipo autorizado. A escolha definitiva de arquitetura continua sujeita à validação; ver ADR 0001, **proposto**.

O uso de SQLite foi autorizado para o MVP-002 (parte de P-003). O desenho específico do schema, driver e migrações está documentado no ADR 0002, **proposto**; FTS5 foi validado em testes, sem busca do produto. As demais propostas de P-003 e P-004 a P-010 mantêm seu estado original. Não há aprovação de provedor/modelo de IA, envio de dados, integração de chave, indexação ou bibliotecas 3D neste incremento.

## Pendências

- A-001 a A-012 continuam abertas conforme a especificação consolidada; nome, identidade e distribuição não foram decididos.
- O SQL citado pela seção 04 não existe no pacote recebido; o MVP-002 criou sua própria migração 001 mínima, sujeita à evolução documentada, sem alterar o original consolidado.
- RF-001 está implementado para pastas locais: seleção nativa, confirmação, persistência e revogação. T-001 cobre a autorização persistida; T-014 cobre revogação preservando o arquivo e o cadastro (ideias/vínculos ainda não existem como funcionalidade). T-008 continua parcial. T-032 a T-035 complementam a cobertura de fontes; os demais testes do produto permanecem no escopo dos respectivos tickets.
- No MVP-003, caminhos de rede e raízes reparse/symlink são recusados; a remoção permanente do cadastro/índice e o reconciliador de renomeações não foram implementados. O desenho de tokens/caminhos está no ADR 0003, **proposto**.
- Persistência de ideias com conteúdo, FTS do produto, backups/restauração, identidade de filesystem e validações de hierarquia entre fontes/ciclos longos continuam pendentes antes dos tickets que expuserem essas operações.
- O repositório na pasta do usuário é distinto do novo repositório local MNEXO; nenhuma configuração desse repositório externo foi modificada.
