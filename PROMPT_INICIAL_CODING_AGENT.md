# PROMPT INICIAL — para colar no seu agente de programação

Quero desenvolver um aplicativo desktop chamado provisoriamente **Universo de Memórias**. Trata-se de um universo digital 3D no qual arquivos e pastas reais do computador são representados como objetos holográficos compostos por elementos correspondentes aos seus dados, e ideias/memórias pessoais são objetos que podem existir e ser organizados independentemente dos arquivos físicos. O usuário navega, aproxima, seleciona, isola visualmente fragmentos, inspeciona dados e retorna à estrutura-mãe. Uma futura integração opcional por chave de API deve permitir que um assistente de IA funcione como “segundo cérebro” por busca/retrieval de fontes autorizadas, com citações e sugestões sujeitas a aprovação.

**Os arquivos da pasta de especificação que vou fornecer são a fonte do projeto.** Leia primeiro `README.md`, `AGENTS.md`, `docs/01_PRODUTO_E_REQUISITOS.md`, `docs/03_ARQUITETURA_TECNICA.md`, `docs/06_SEGURANCA_PRIVACIDADE.md`, `docs/07_PLANO_DE_IMPLEMENTACAO.md`, `docs/08_TESTES_E_CRITERIOS.md` e `docs/09_DECISOES_PENDENCIAS.md`. Consulte os demais quando necessário.

**Não comece criando todo o aplicativo.** Neste primeiro contato, faça apenas:

1. Verifique o estado real do repositório e as versões de ferramentas do ambiente. Se o repositório estiver vazio, diga isso; se não estiver vazio, liste o que existe sem presumir.
2. Resuma o produto em suas palavras, separando requisitos confirmados de propostas técnicas e decisões abertas.
3. Examine se Tauri 2 + Rust + React/TypeScript + React Three Fiber + SQLite é adequado e identifique riscos reais, com referências a documentação oficial atual.
4. Apresente uma proposta de estrutura inicial de pastas, dependências e estratégia de testes.
5. Proponha **somente** um plano de execução para a **Etapa 0 (Fundação)**, com tarefas pequenas, critérios verificáveis e rollback.
6. Aguarde minha autorização para editar/criar código. Não execute nada que altere arquivos pessoais fora do workspace.

Ao desenvolver depois, aplique `AGENTS.md` rigorosamente: nunca invente resultados, nunca confunda proposta com decisão aprovada, documente alterações e testes, e não use dados pessoais ou a chave API sem consentimento. O app deve funcionar offline sem integração IA. Proteja os arquivos reais: manipulação 3D não significa mover nem apagar.

**Primeira pergunta a responder:** “Qual é o menor protótipo tecnicamente verificável que prova a arquitetura sem varrer meu PC inteiro?”
