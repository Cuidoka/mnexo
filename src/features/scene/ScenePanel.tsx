import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  catalogErrorMessage,
  getNodeDetail,
  type NodeDetail,
} from '../../shared/api/catalog';
import {
  getSceneProjection,
  type SceneProjection,
} from '../../shared/api/scene';
import { formatBytes } from '../catalog/metadata-format';
import { NodeDetails } from '../catalog/NodeDetails';
const SceneCanvas = lazy(() =>
  import('./SceneCanvas').then((module) => ({ default: module.SceneCanvas })),
);

export function ScenePanel({
  sourceId,
  scanId,
  sourceName,
  onClose,
  onRefresh,
  onOpen2D,
}: {
  sourceId: string;
  scanId: string;
  sourceName: string;
  onClose: () => void;
  onRefresh: () => void;
  onOpen2D: () => void;
}) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [projection, setProjection] = useState<SceneProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const loadRevision = useRef(0);
  const detailRevision = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const revision = ++loadRevision.current;
    getSceneProjection(sourceId, scanId, folderId).then(
      (result) => {
        if (active && revision === loadRevision.current) {
          setProjection(result);
          setDetail(result.root);
          setSelectedId(result.root.node.id);
          setError(null);
        }
      },
      (failure) => {
        if (active && revision === loadRevision.current)
          setError(catalogErrorMessage(failure));
      },
    );
    return () => {
      active = false;
      detailRevision.current += 1;
    };
  }, [sourceId, scanId, folderId, attempt]);

  const nodes = projection ? [projection.root.node, ...projection.nodes] : [];
  const names = new Map(nodes.map((node) => [node.id, node.title]));
  const selected = nodes.find((node) => node.id === selectedId);
  function navigate(id: string | null) {
    if (
      id !== null &&
      id !== folderId &&
      !projection?.breadcrumbs.some((item) => item.id === id) &&
      !nodes.some((node) => node.id === id && node.kind === 'folder')
    )
      return;
    loadRevision.current += 1;
    detailRevision.current += 1;
    setProjection(null);
    setDetail(null);
    setSelectedId(null);
    setError(null);
    setDetailError(null);
    setLoadingDetail(false);
    setFolderId(id);
    setAttempt((value) => value + 1);
  }
  async function select(id: string | null) {
    if (id !== null && !nodes.some((node) => node.id === id)) return;
    const revision = ++detailRevision.current;
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setLoadingDetail(false);
    if (id === null) return;
    if (id === projection?.root.node.id) {
      setDetail(projection.root);
      return;
    }
    setLoadingDetail(true);
    try {
      const result = await getNodeDetail(sourceId, scanId, id);
      if (mounted.current && revision === detailRevision.current)
        setDetail(result);
    } catch (failure) {
      if (mounted.current && revision === detailRevision.current)
        setDetailError(catalogErrorMessage(failure));
    } finally {
      if (mounted.current && revision === detailRevision.current)
        setLoadingDetail(false);
    }
  }
  return (
    <section
      className="catalog-browser scene-panel"
      aria-labelledby="scene-title"
    >
      <div className="catalog-header">
        <div>
          <h2 id="scene-title">Cena 3D — {sourceName}</h2>
          <p>Metadados do índice salvo. O estado no disco pode ter mudado.</p>
        </div>
        <div className="catalog-actions">
          <button className="text-button" type="button" onClick={onRefresh}>
            Atualizar catálogo
          </button>
          <button className="secondary-button" type="button" onClick={onOpen2D}>
            Ver índice 2D
          </button>
          <button className="secondary-button" type="button" onClick={onClose}>
            Fechar cena
          </button>
        </div>
      </div>
      {!projection && !error && <p role="status">Consultando nós do índice…</p>}
      {error && (
        <div className="source-error" role="alert">
          <p>{error}</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => navigate(folderId)}
          >
            Tentar novamente
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => navigate(null)}
          >
            Voltar à raiz da fonte
          </button>
        </div>
      )}
      {projection && (
        <>
          <nav className="catalog-breadcrumbs" aria-label="Caminho da cena">
            <ol>
              {projection.breadcrumbs.map((crumb, index) => (
                <li key={crumb.id}>
                  <button
                    className="text-button"
                    type="button"
                    aria-current={
                      index === projection.breadcrumbs.length - 1
                        ? 'page'
                        : undefined
                    }
                    disabled={index === projection.breadcrumbs.length - 1}
                    onClick={() => navigate(crumb.id)}
                  >
                    {crumb.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <div className="scene-controls">
            <button
              className="secondary-button"
              type="button"
              disabled={!projection.root.parent}
              onClick={() => navigate(projection.root.parent!.id)}
            >
              Voltar à pasta pai
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={
                !selected ||
                selected.kind !== 'folder' ||
                selected.id === projection.root.node.id
              }
              onClick={() => navigate(selected!.id)}
            >
              Entrar na pasta selecionada
            </button>
          </div>
          <p>
            {nodes.length} nós reais, incluindo a pasta atual. Índice de{' '}
            {new Date(projection.root.indexedAt).toLocaleString('pt-BR')}.
          </p>
          {projection.truncated && (
            <p className="catalog-warning" role="status">
              Exibição limitada a 100 nós e 3 níveis abaixo da pasta atual. Há
              itens do índice fora desta cena; entre em uma pasta ou consulte o
              índice 2D.
            </p>
          )}
          {projection.root.node.sizePartial && (
            <p className="catalog-warning">
              Índice parcial: consulte o relatório de erros da fonte.
            </p>
          )}
          <div className="scene-layout">
            <div>
              <Suspense
                fallback={<p role="status">Carregando renderizador 3D…</p>}
              >
                <SceneCanvas
                  key={`${sourceId}:${scanId}:${projection.root.node.id}`}
                  projection={projection}
                  selectedId={selectedId}
                  onSelect={(id) => void select(id)}
                  onOpen={navigate}
                />
              </Suspense>
              <p className="scene-legend">
                <span>Verde: pastas e seus limites.</span>{' '}
                <span>Azul: arquivos.</span>{' '}
                <span>Âmbar: metadados parciais.</span>{' '}
                <span>Amarelo claro: seleção.</span>
              </p>
              <p>
                Volumes organizados por parentesco; tamanho dos arquivos em
                escala comprimida.
              </p>
            </div>
            <div aria-live="polite">
              {loadingDetail && (
                <p role="status">Carregando metadados da seleção…</p>
              )}
              {detailError && <p role="alert">{detailError}</p>}
              {detail && <NodeDetails detail={detail} onParent={navigate} />}
              {!selectedId && (
                <p>Selecione um item para consultar seus metadados.</p>
              )}
            </div>
          </div>
          <details>
            <summary>Relação dos {nodes.length} nós exibidos</summary>
            <div className="catalog-table-scroll">
              <table className="catalog-table">
                <caption>Identidade e metadados dos objetos da cena</caption>
                <thead>
                  <tr>
                    <th>Nome / ID</th>
                    <th>Tipo</th>
                    <th>Pasta pai</th>
                    <th>Tamanho indexado</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((node) => (
                    <tr
                      key={node.id}
                      className={
                        node.id === selectedId ? 'catalog-selected' : undefined
                      }
                    >
                      <td>
                        <button
                          className="catalog-item"
                          type="button"
                          aria-label={`Selecionar ${node.title}`}
                          aria-pressed={selectedId === node.id}
                          onClick={() => void select(node.id)}
                        >
                          {node.title}
                        </button>
                        <br />
                        <small>{node.id}</small>
                        {node.kind === 'folder' &&
                          node.id !== projection.root.node.id && (
                            <button
                              className="text-button"
                              type="button"
                              aria-label={`Entrar em ${node.title}`}
                              onClick={() => navigate(node.id)}
                            >
                              Entrar
                            </button>
                          )}
                      </td>
                      <td>{node.kind === 'folder' ? 'Pasta' : 'Arquivo'}</td>
                      <td>
                        {node.parentId === null
                          ? 'Raiz da fonte'
                          : (names.get(node.parentId) ??
                            projection.root.parent?.title)}
                      </td>
                      <td>
                        {formatBytes(node.sizeBytes)}
                        {node.sizePartial ? ' (parcial)' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
