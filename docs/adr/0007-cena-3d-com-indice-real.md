# ADR 0007 — Cena 3D inicial com nós do índice

Data: 2026-11-11

Status: **proposto**

## Contexto autorizado

MVP-007 / RF-003 pede cena WebGL inicial a partir de uma raiz e 10–100 nós reais do índice. RF-003 estabelece pastas contendo visualmente seus filhos. MVP-006 já fornece identidade, parentesco, autorização e snapshots consistentes. Órbita, zoom, seleção e navegação visual pertencem ao MVP-008 / RF-004; isolamento pertence ao MVP-009 / RF-005. Não há autorização para ampliar o scanner além da fixture.

## Escolha proposta e alternativas

Usar Three.js 0.187.0 diretamente, com tipos 0.187.0, fixados no lockfile. Licença MIT, sem custo por uso, credenciais ou serviços remotos. Integração independente do reconciliador React, em efeito com descarte explícito. React Three Fiber permanece alternativa futura: não é necessário acrescentar um segundo reconciliador para esta cena estática. Canvas2D não exercitaria a renderização WebGL pedida; WebGPU ampliaria a exigência de plataforma.

O renderer atual do Three exige WebGL 2. A ausência/perda do contexto oferece mensagem e acesso ao índice 2D existente; não simula sucesso gráfico. Biblioteca e shaders/geometrias são locais, carregados em chunk sob demanda. A dependência aumenta o bundle (o build registra aviso de chunk maior que 500 kB), sem alterar CSP, permissões de rede ou distribuição.

## Contrato e orçamento

`get_scene_projection(sourceId, scanId)` retorna root NodeDetail, nodes NodeSummary[], nodeLimit=100, depthLimit=3 e truncated. UUIDs, fonte habilitada e coincidência com o relatório atual são validados no backend. Uma transação DEFERRED dá uma visão consistente de fonte/relatório/nós. Consultas filtram origem filesystem, file/folder, fonte e scan; nenhum caminho externo ou SQL é aceito pelo comando. As validações lexicais da raiz e das relações pai-filho não acessam a fonte.

Percurso em largura, ordenação fixa pasta/título BINARY/ID, pais antes dos filhos. Até 100 nós **incluindo a raiz**, até três níveis abaixo dela. Cada pasta consulta orçamento restante+1; no limite de nós/profundidade consulta só um sentinela. Se existe descendente omitido, truncated=true. Isso limita CPU, transferência, objetos e trabalho SQL; não inventa contagem de omitidos nem mascara o limite como árvore completa. Pastas vazias/índices menores são representados com sua quantidade verdadeira.

Projeção preserva o fechamento por ancestral: todo nó incluído tem seu pai incluído. Layout em grade aninhada acomoda volumes de filhos dentro dos limites de cada pasta. Arquivos usam escala logarítmica comprimida, zero/null têm volume mínimo; tamanho visual de pasta reflete a organização dos descendentes incluídos. Não se promete escala de ocupação física do disco. UUIDs do índice identificam grupos via userData.nodeId; posição, geometria e caminho não geram identidade.

## Interface e ciclo de vida

Abrir cena é explícito em Fontes. A tela mostra snapshot, contagem, legenda de pastas/arquivos/parcialidade e relação HTML de nome, UUID, tipo, pai e bytes exatos. A câmera fixa enquadra a esfera da raiz, considerando aspecto da janela. ResizeObserver reenquadra e renderiza por demanda; pixel ratio até 2. Não há animação ociosa nem navegação/seleção de malhas antecipada.

Mudança de snapshot remonta a consulta; revogação fecha a cena e bloqueia futuras leituras no Rust. Respostas atrasadas após desmontagem são ignoradas. Desmontar ou perder contexto descarta observador/listener/canvas, geometrias e materiais compartilhados, renderer e contexto. O fallback oferece o índice 2D. Nenhum conteúdo é aberto ou transmitido, nenhuma operação do SO é exposta à UI/modelo.

## Verificação e rollback

T-050 a T-055 cobrem projeção de banco sintético real, limites/snapshot/autorização, fixture de contrato Rust/TS, contenção em três eixos, identidade, UI/ciclo de vida e renderização WebGL 2 real em Chromium headless isolado. Esse teste usa o renderer de produção e JSON sintético, sem IPC/banco do produto. Ele não substitui testes WebView2/GPU nativos; resultados reais e limitações ficam em docs/08_TESTES_E_CRITERIOS.md.

O preparo opcional `fixture:prepare:3d` cria nove arquivos sintéticos adicionais na fixture fixa com flag wx e checagem de links, sem sobrescrever dados existentes. Não indexa automaticamente. Schema continua 2 e nenhum dado de cena é persistido. Reverter código para MVP-006 preserva fontes, índice e autorizações; não apagar registros/arquivos para rollback.

## Referências verificadas

- <https://registry.npmjs.org/three/latest> e `pnpm view @types/three version` (0.187.0 em 11/11/2026).
- <https://threejs.org/docs/pages/WebGLRenderer.html> — WebGL 2, render, dispose e forceContextLoss.
- Implementação local fixada: three/src/renderers/WebGLRenderer.js, core/BufferGeometry.js e materials/Material.js (dispose).
- <https://vite.dev/guide/api-javascript> — servidor isolado do harness.
- <https://developer.chrome.com/docs/automation-and-testing/headless> — execução sem janela e screenshot/DOM.
- <https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md> — teste com ANGLE/SwiftShader, independente de GPU física.
