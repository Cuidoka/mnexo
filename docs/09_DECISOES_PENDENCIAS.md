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

P-001 (Windows primeiro) e P-002 (Tauri/Rust/React) estão sendo exercitados neste protótipo autorizado. A escolha definitiva de arquitetura continua sujeita à validação; ver ADR 0001, **proposto**.

O uso de SQLite foi autorizado para o MVP-002 (parte de P-003). O desenho específico do schema, driver e migrações está documentado no ADR 0002, **proposto**; FTS5 foi validado em testes, sem busca do produto. As demais propostas de P-003 e P-004 a P-010 mantêm seu estado original. Não há aprovação de provedor/modelo de IA, envio de dados, integração de chave, indexação ou bibliotecas 3D neste incremento.

## Pendências

- A-001 a A-012 continuam abertas conforme a especificação consolidada; nome, identidade e distribuição não foram decididos.
- O SQL citado pela seção 04 não existe no pacote recebido; o MVP-002 criou sua própria migração 001 mínima, sujeita à evolução documentada, sem alterar o original consolidado.
- RF-001 e os testes T-001 a T-024 do produto permanecem pendentes; T-008 tem cobertura parcial do banco. T-025 a T-031 são testes adicionais de fundação e não indicam conclusão do MVP completo.
- Persistência de ideias com conteúdo, FTS do produto, backups/restauração, identidade de filesystem e validações de hierarquia entre fontes/ciclos longos continuam pendentes antes dos tickets que expuserem essas operações.
- O repositório na pasta do usuário é distinto do novo repositório local MNEXO; nenhuma configuração desse repositório externo foi modificada.
