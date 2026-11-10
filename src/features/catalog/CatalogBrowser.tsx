import { useEffect, useRef, useState } from 'react';
import {
  catalogErrorMessage,
  getNodeChildren,
  getNodeDetail,
  type NodeDetail,
  type NodePage,
} from '../../shared/api/catalog';
import { NodeDetails } from './NodeDetails';
import { formatBytes } from './metadata-format';

export function CatalogBrowser({
  sourceId,
  scanId,
  sourceName,
  onClose,
  onRefresh,
}: {
  sourceId: string;
  scanId: string;
  sourceName: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<NodePage | null>(null);
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const pageRevision = useRef(0);
  const detailRevision = useRef(0);
  const mounted = useRef(false);
  const morePending = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const revision = ++pageRevision.current;
    getNodeChildren(sourceId, scanId, folderId).then(
      (result) => {
        if (active && revision === pageRevision.current) {
          setPage(result);
          setDetail(result.folder);
          setLoading(false);
          setError(null);
        }
      },
      (failure) => {
        if (active && revision === pageRevision.current) {
          setError(catalogErrorMessage(failure));
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
      detailRevision.current += 1;
    };
  }, [sourceId, scanId, folderId, attempt]);

  function navigate(id: string | null) {
    pageRevision.current += 1;
    detailRevision.current += 1;
    morePending.current = false;
    setPage(null);
    setDetail(null);
    setError(null);
    setDetailError(null);
    setLoading(true);
    setLoadingMore(false);
    setLoadingDetail(false);
    setFolderId(id);
    setAttempt((value) => value + 1);
  }

  async function select(id: string) {
    const revision = ++detailRevision.current;
    setDetail(null);
    setDetailError(null);
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

  async function more() {
    if (!page?.nextCursor || morePending.current) return;
    morePending.current = true;
    const revision = pageRevision.current;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await getNodeChildren(
        sourceId,
        scanId,
        page.folder.node.id,
        page.nextCursor,
      );
      if (mounted.current && revision === pageRevision.current) {
        setPage({ ...result, items: [...page.items, ...result.items] });
      }
    } catch (failure) {
      if (mounted.current && revision === pageRevision.current) {
        detailRevision.current += 1;
        setPage(null);
        setDetail(null);
        setLoadingDetail(false);
        setError(catalogErrorMessage(failure));
      }
    } finally {
      if (mounted.current && revision === pageRevision.current) {
        morePending.current = false;
        setLoadingMore(false);
      }
    }
  }

  return (
    <section className="catalog-browser" aria-labelledby="catalog-title">
      <div className="catalog-header">
        <div>
          <h2 id="catalog-title">Índice 2D — {sourceName}</h2>
          <p>
            Consulta aos metadados salvos. O estado no disco pode ter mudado
            desde a indexação.
          </p>
        </div>
        <div className="catalog-actions">
          <button className="text-button" type="button" onClick={onRefresh}>
            Atualizar catálogo
          </button>
          <button className="secondary-button" type="button" onClick={onClose}>
            Fechar índice
          </button>
        </div>
      </div>
      {loading && <p role="status">Carregando pasta do índice…</p>}
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
            Voltar à raiz
          </button>
        </div>
      )}
      {page && (
        <>
          <nav className="catalog-breadcrumbs" aria-label="Caminho no índice">
            <ol>
              {page.breadcrumbs.map((crumb, index) => (
                <li key={crumb.id}>
                  <button
                    className="text-button"
                    type="button"
                    aria-current={
                      index === page.breadcrumbs.length - 1 ? 'page' : undefined
                    }
                    disabled={index === page.breadcrumbs.length - 1}
                    onClick={() => navigate(crumb.id)}
                  >
                    {crumb.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <button
            className="text-button"
            type="button"
            disabled={page.folder.node.parentId === null}
            onClick={() => navigate(page.folder.node.parentId)}
          >
            Voltar à pasta pai
          </button>
          <div className="catalog-layout">
            <section aria-label="Itens da pasta">
              <h3>{page.folder.node.title}</h3>
              {page.folder.node.sizePartial && (
                <p className="catalog-warning">
                  Metadados parciais. Confira o relatório da fonte.
                </p>
              )}
              {page.items.length === 0 ? (
                <p>
                  {page.folder.node.sizePartial
                    ? 'Nenhum filho indexado nesta pasta parcial.'
                    : 'Pasta vazia no índice.'}
                </p>
              ) : (
                <div className="catalog-table-scroll">
                  <table className="catalog-table">
                    <caption>Filhos da pasta atual</caption>
                    <thead>
                      <tr>
                        <th scope="col">Nome</th>
                        <th scope="col">Tipo</th>
                        <th scope="col">Tamanho</th>
                        <th scope="col">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.items.map((item) => (
                        <tr
                          key={item.id}
                          className={
                            detail?.node.id === item.id
                              ? 'catalog-selected'
                              : ''
                          }
                        >
                          <td>
                            <button
                              className="catalog-item"
                              type="button"
                              aria-label={
                                item.kind === 'folder'
                                  ? `Abrir pasta ${item.title}`
                                  : `Selecionar arquivo ${item.title}`
                              }
                              onClick={() =>
                                item.kind === 'folder'
                                  ? navigate(item.id)
                                  : void select(item.id)
                              }
                            >
                              {item.title}
                              {item.kind === 'folder' && (
                                <span aria-hidden="true"> ›</span>
                              )}
                            </button>
                          </td>
                          <td>
                            {item.kind === 'folder' ? 'Pasta' : 'Arquivo'}
                          </td>
                          <td>
                            {formatBytes(item.sizeBytes)}
                            {item.sizePartial && ' (parcial)'}
                          </td>
                          <td>
                            <button
                              className="text-button"
                              type="button"
                              aria-label={`Ver metadados de ${item.title}`}
                              onClick={() => void select(item.id)}
                            >
                              Detalhes
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {page.nextCursor && (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void more()}
                >
                  {loadingMore ? 'Carregando mais…' : 'Carregar mais itens'}
                </button>
              )}
            </section>
            <div>
              {loadingDetail && <p role="status">Carregando metadados…</p>}
              {detailError && (
                <p className="source-error" role="alert">
                  {detailError}
                </p>
              )}
              {detail && (
                <NodeDetails detail={detail} onParent={(id) => navigate(id)} />
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
