# ADR 0008 — Navegação, câmera e seleção 3D

Data: 2026-11-11

Status: **proposto**

## Contexto autorizado

MVP-008 / RF-004 pede órbita, zoom, seleção e navegação entre filhos/pais; RF-004 confirmado inclui pan. A cena inicial e o catálogo já existem. O incremento mantém identidade no backend, fonte autorizada, snapshot consistente e metadados locais. Isolar/reintegrar é MVP-009 / RF-005, não antecipado.

## Contrato e contexto da navegação

Estender o comando existente `get_scene_projection(sourceId, scanId, folderId?)`, sem criar permissões ou migração. Null consulta raiz; UUID consulta pasta atual do mesmo índice. SceneProjection acrescenta breadcrumbs, da raiz da fonte à pasta atual; root pode ter parent. Root permanece NodeDetail, nodes permanece NodeSummary[] sem a pasta atual. Limites 100 nós/3 níveis são relativos à pasta atual; ancestrais não consomem esse orçamento e breadcrumbs mantém máximo de 32 elementos.

Uma transação valida autorização/snapshot, tipo pasta e cadeia de pais da mesma fonte/scan. Entrar em arquivo, ID retido/estrangeiro, ciclo ou caminho incoerente retorna erro público. A UI não envia paths e não consulta filesystem. O parser TS verifica contexto solicitado, IDs/pais/depth, breadcrumbs únicos e correspondência de pasta/parent. Atualizar contrato e fixtures Rust/TS no mesmo commit evita aceitar uma resposta antiga sem breadcrumbs.

Entrar em pasta refaz a projeção limitada desse ponto, preservando sourceId/scanId e contexto até a fonte. Pai e breadcrumbs usam IDs do catálogo. Cada nova vista reenquadra a câmera e seleciona sua pasta atual. Não salvar histórico de câmera/seleção nem estado visual no banco nesta etapa. Uma alternativa seria preservar câmera por pasta; adicionaria estado e política de restauração ainda não solicitados. O contexto verificável deste incremento é hierarquia, origem e snapshot, apresentado em texto.

## Câmera e seleção propostas

Usar OrbitControls/Raycaster da dependência Three.js 0.187.0 já instalada, MIT, local e sem custo por uso/serviço externo. Não introduzir reconciliador ou biblioteca de gestos nova. Controles sem damping/autoRotate permitem redesenhar por change/resize, sem animação ociosa. Zoom em distância limitada pelo volume atual; resize conserva orientação, pan e razão de zoom. Reenquadrar repõe alvo e posição inicial.

Mouse: arrasto esquerdo orbita; roda/médio ajusta zoom; direito faz pan. OrbitControls também atende gestos touch, cuja compatibilidade física não é presumida pelos testes de mouse. Botões HTML oferecem órbita/zoom/reset; canvas focável atende setas, Shift+setas, +/− e Home. Seleção/entrada também existem na relação textual por teclado. Nenhum atalho abre conteúdo ou executa comando do SO.

Raycaster escolhe a primeira interseção visível de bloco/base/contorno; cada objeto carrega nodeId vindo do índice. Clique seleciona e muda material; painel consulta get_node_detail por ID. Duplo clique ou Enter abre apenas pasta descendente, com validação novamente no backend. O contorno/bloco em amarelo claro e o estado textual identificam seleção sem depender apenas da cor. Movimento maior que cinco pixels CSS, múltiplos ponteiros ou cancelamento de gesto suprimem o clique de seleção; evita confundir órbita/pan com seleção.

Requisições de projeção/detalhe têm revisões; navegar/fechar invalida resultados atrasados. Falha de navegação remove a cena/detalhes anteriores e oferece nova tentativa/raiz. Revogação e mudança de snapshot continuam desmontando/remontando via Fontes. Falha/perda de WebGL mantém alternativa 2D. Dispose é idempotente e remove controles, listeners de canvas/documento, observador, geometrias/materiais e contexto. Não há mudança de paths, parentesco, conteúdo ou autorização por gesto visual.

## Testes e limites

T-056/T-057 cobrem consulta de pasta/pai, limites relativos, ancestralidade, autorização e contrato raiz/pasta compartilhado Rust/TS, em SQLite sintético real. T-011/T-060 cobrem seleção do ID correto, metadados, pasta vazia, pai/breadcrumb, erros e resultados atrasados. T-058/T-059 cobrem sessão/controles e descarte. T-061 usa Chrome headless isolado com WebGL 2 e entrada real CDP: arrastar, pan, roda, picking, duplo clique, teclado e reenquadramento. Sonda de picking existe somente no harness sintético; não entra no bundle do produto. Testes não usam perfil pessoal, fontes pessoais ou banco do aplicativo.

WebView2/GPU nativos, toque físico e leitores de tela reais exigem validação própria, registrada honestamente em docs/08_TESTES_E_CRITERIOS.md. Cenas grandes além do orçamento mantêm aviso; não há paginação visual 3D ou garantia de desempenho para milhares de objetos. Schema 2 e 12 comandos específicos permanecem. Reverter código para MVP-007 preserva o banco; frontend/backend devem ser revertidos juntos por causa do contrato ampliado.

## Referências verificadas

- <https://threejs.org/docs/pages/OrbitControls.html>
- <https://threejs.org/docs/pages/Raycaster.html>
- Implementação fixada local: three/examples/jsm/controls/OrbitControls.js (eventos, update e dispose).
- <https://chromedevtools.github.io/devtools-protocol/> — Input, Runtime e Page; endpoint do teste restrito ao loopback do perfil novo.
