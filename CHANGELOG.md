# Changelog

## Em desenvolvimento — 2026-11-09

### MVP-004 / RF-002 — metadados da fixture

- Adicionado preparo explícito de fixture sintética, preservando arquivos existentes, e scanner restrito no backend ao caminho fixo dessa fixture autorizada.
- Indexação somente por clique/ID, com revalidação de autorização durante a leitura e antes da publicação; iniciar, listar ou autorizar não dispara scan.
- Persistidos nome, caminho, tipo, hierarquia, bytes lógicos e datas do filesystem; soma de pastas inclui descendentes acessíveis e sinaliza parcialidade.
- Criada migração 002 aditiva e publicação transacional do snapshot/relatório. Reindexação preserva IDs; registros antigos permanecem fora do snapshot atual, sem deleção de fontes/nós.
- Exibidos contagens, data e relatório de erros/exclusões, com bytes em string decimal, até 100 amostras e total de ocorrências separado.
- Recusados links/reparse e raízes fora da fixture; limites de entradas/profundidade/tempo e exclusões conservadoras documentados no ADR 0004, **proposto**.
- Estendida rastreabilidade T-002/T-003/T-004/T-005/T-006/T-008 e T-036 a T-039 para persistência, escopo, rollback, limites e contrato/UI. Sem leitura de conteúdo, rede ou IA.
- Registrada a instrução do usuário de detalhar cada passo concluído em commit e enviá-lo ao GitHub. Progresso/cancelamento permanecem no MVP-005.

Resultados reais e limites de teste: `docs/08_TESTES_E_CRITERIOS.md`.

### MVP-003 / RF-001 — fontes autorizadas

- Adicionados diálogo nativo de pasta, revisão do caminho e autorização explícita por token volátil de uso único, sem scan automático.
- Implementadas listagem persistida e revogação não destrutiva. Reautorizar o mesmo caminho canônico preserva ID/data da fonte, sem duplicação.
- Caminhos e UUIDs são determinados no Rust; o frontend não envia caminho livre, SQL ou comandos do SO. Erros retornam códigos sanitizados.
- Mantidos schema 1 e dados existentes; nenhuma fonte é cadastrada ou consultada no filesystem automaticamente ao iniciar.
- Adicionados testes de T-001/T-014 e T-032 a T-034 para consentimento, cancelamento, tokens, revalidação, Unicode, deduplicação, persistência e revogação. Inspeção nativa registrada em T-035.
- Scanner de metadados permanece no MVP-004 / RF-002. Rede, conteúdo de arquivos, IA e remoção permanente de cadastro continuam fora deste incremento.

Decisões propostas: ADR 0003. Comandos, resultados e limites reais: `docs/08_TESTES_E_CRITERIOS.md`.

## Em desenvolvimento — 2026-10-29

### MVP-002 — SQLite e migração (RNF-004)

- Adicionado SQLite incorporado via rusqlite e migração 001 para a base `sources`/`nodes` vazia, com FKs e checks básicos; nenhuma fonte é adicionada ou autorizada automaticamente.
- Implementadas transação de migração, identificação do banco, versão persistida e recusa de arquivos inválidos, desconhecidos ou mais novos sem recriação.
- Atualizado `get_app_status` para consultar o banco em worker e retornar disponibilidade e schema reais; atualizado o contrato Rust/TypeScript e suas fixtures no mesmo incremento.
- Interface distingue banco pronto/indisponível e permite nova tentativa, sem expor caminhos ou erros internos.
- Adicionados testes T-028/T-029 de persistência, integridade, FKs, precisão, concorrência e rollback e T-030 de FTS5 sintético. T-008 tem cobertura parcial do banco.
- Verificados executável release, banco interno vazio e reabertura com status pronto por acessibilidade (T-031); captura visual/clique limitados por falha da ferramenta, registrada no relatório.
- Banco de ideias, FTS do produto, seleção de pasta (MVP-003), scanner e IA permanecem fora deste incremento.

Resultados reais de validação: `docs/08_TESTES_E_CRITERIOS.md`. Decisões de implementação: ADR 0002, **proposto**.

## 0.1.0 — 2026-10-29

### MVP-001 — fundação desktop

- Adicionados shell Tauri 2, React/TypeScript/Vite e tela Fontes.
- Implementado `get_app_status` sem I/O, com versão, banco não inicializado, schema ausente e IA desativada.
- Restringido o comando à janela principal por manifesto, permissão e capability explícitos; configurada CSP local.
- Adicionados tratamento de falha e nova tentativa, distinção entre navegador e aplicativo desktop e testes T-025/T-026.
- Validada a janela release e a chamada real ao Rust (T-027); ajustado o estado vazio para manter o diagnóstico visível na abertura.
- Adicionados comandos de format, lint, testes e build; lockfiles, orientação de setup e ADR proposto.
- RF-001 continua pendente: a tela prepara o espaço Fontes, mas não autoriza ou indexa pastas.
- Os documentos originais permanecem preservados; SQLite (MVP-002), cena 3D e IA ficam fora deste incremento.

Resultados reais de validação e limitações: `docs/08_TESTES_E_CRITERIOS.md`.
