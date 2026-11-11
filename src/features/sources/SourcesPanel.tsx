import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addScanSource,
  cancelScanSourceSelection,
  chooseScanSource,
  listScanSources,
  revokeScanSource,
  sourceErrorMessage,
  type FolderSelection,
  type ScanSource,
} from '../../shared/api/scan-sources';
import { ScanReportView } from './ScanReportView';
import { ScanJobsPanel } from './ScanJobsPanel';
import { CatalogBrowser } from '../catalog/CatalogBrowser';
import { ScenePanel } from '../scene/ScenePanel';

export function SourcesPanel({ available }: { available: boolean }) {
  const [sources, setSources] = useState<ScanSource[]>([]);
  const [browsingId, setBrowsingId] = useState<string | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [selection, setSelection] = useState<FolderSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const selectionHeading = useRef<HTMLHeadingElement>(null);
  const listRevision = useRef(0);
  const refreshAfterScan = useCallback(() => {
    listRevision.current += 1;
    setLoading(true);
    setRefresh((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!available) return;
    let active = true;
    const revision = ++listRevision.current;
    listScanSources().then(
      (items) => {
        if (active && revision === listRevision.current) {
          setSources(items);
          setError(null);
          setLoading(false);
        }
      },
      (failure: unknown) => {
        if (active && revision === listRevision.current) {
          setError(sourceErrorMessage(failure));
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [available, refresh]);

  useEffect(() => {
    if (selection) selectionHeading.current?.focus();
  }, [selection]);

  async function selectFolder() {
    listRevision.current += 1;
    setBusy(true);
    setError(null);
    setNotice(null);
    setSelection(null);
    try {
      const chosen = await chooseScanSource();
      setSelection(chosen);
      if (!chosen) setNotice('Seleção cancelada.');
    } catch (failure) {
      setError(sourceErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function authorize() {
    if (!selection) return;
    const token = selection.selectionToken;
    setSelection(null);
    setBusy(true);
    setError(null);
    try {
      const source = await addScanSource(token);
      setSources((items) => [
        ...items.filter((item) => item.id !== source.id),
        source,
      ]);
      setNotice('Pasta autorizada. Nenhuma varredura foi iniciada.');
    } catch (failure) {
      setError(sourceErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setSelection(null);
    setBusy(true);
    setError(null);
    try {
      await cancelScanSourceSelection();
      setNotice('Autorização cancelada.');
    } catch (failure) {
      setError(sourceErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(source: ScanSource) {
    listRevision.current += 1;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const changed = await revokeScanSource(source.id);
      setBrowsingId((current) => (current === changed.id ? null : current));
      setSceneId((current) => (current === changed.id ? null : current));
      setSources((items) =>
        items.map((item) => (item.id === changed.id ? changed : item)),
      );
      setNotice(
        'Autorização revogada. Os arquivos permanecem na pasta original.',
      );
    } catch (failure) {
      setError(sourceErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const disabled = !available || busy || loading;
  const browsing = sources.find(
    (source) =>
      source.id === browsingId && source.authorized && source.lastScan,
  );
  const scene = sources.find(
    (source) => source.id === sceneId && source.authorized && source.lastScan,
  );
  return (
    <section className="sources-card" aria-labelledby="sources-title">
      <div className="section-heading">
        <h2 id="sources-title">Pastas do computador</h2>
        <button
          className="primary-button"
          type="button"
          disabled={disabled || selection !== null}
          onClick={() => void selectFolder()}
        >
          {busy ? 'Aguarde…' : 'Selecionar pasta'}
        </button>
      </div>

      {selection && (
        <section
          className="selection-preview"
          aria-labelledby="selection-title"
        >
          <h3 id="selection-title" ref={selectionHeading} tabIndex={-1}>
            Autorizar pasta selecionada?
          </h3>
          <p className="source-path">{selection.rootPath}</p>
          <p>
            Você autoriza o MNEXO a guardar esta fonte para indexação de
            metadados, quando disponível para esta pasta. Ler conteúdo ou enviar
            dados à IA exige autorização separada.
          </p>
          <p>Nenhuma varredura será iniciada ao confirmar.</p>
          <div className="source-actions">
            <button
              className="primary-button"
              type="button"
              disabled={disabled}
              onClick={() => void authorize()}
            >
              Autorizar pasta
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => void cancel()}
            >
              Cancelar autorização
            </button>
          </div>
        </section>
      )}

      {available && loading && (
        <p className="source-notice" role="status">
          Carregando fontes…
        </p>
      )}
      {sources.length === 0 && !selection && !loading && !error && (
        <div className="sources-empty">
          <h3>Seu espaço ainda está vazio</h3>
          <p>
            Selecione uma pasta e confirme a autorização para adicioná-la às
            suas fontes.
          </p>
          <span className="privacy-note">
            Nenhuma pasta é examinada automaticamente.
          </span>
        </div>
      )}

      {sources.length > 0 && (
        <ul className="source-list" aria-label="Fontes cadastradas">
          {sources.map((source) => (
            <li key={source.id} className="source-row">
              <div className="source-info">
                <h3>{source.displayName}</h3>
                <p className="source-path">{source.rootPath}</p>
                <span
                  className={`source-authorization ${source.authorized ? '' : 'revoked'}`}
                >
                  {source.authorized
                    ? 'Autorizada para metadados'
                    : 'Autorização revogada'}
                </span>
              </div>
              {source.lastScan && <ScanReportView report={source.lastScan} />}
              {source.authorized &&
                source.lastScan &&
                source.lastScan.foldersCount > 0 && (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={disabled || selection !== null}
                    aria-label={`Explorar índice de ${source.displayName}`}
                    onClick={() => {
                      setSceneId(null);
                      setBrowsingId(source.id);
                    }}
                  >
                    Explorar índice 2D
                  </button>
                )}
              {source.authorized &&
                source.lastScan &&
                source.lastScan.foldersCount > 0 && (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={disabled || selection !== null}
                    aria-label={`Ver cena 3D de ${source.displayName}`}
                    onClick={() => {
                      setBrowsingId(null);
                      setSceneId(source.id);
                    }}
                  >
                    Ver cena 3D
                  </button>
                )}
              {source.authorized && (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={disabled || selection !== null}
                  aria-label={`Revogar autorização de ${source.displayName}`}
                  onClick={() => void revoke(source)}
                >
                  Revogar autorização
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {available && browsing?.lastScan && (
        <CatalogBrowser
          key={`${browsing.id}:${browsing.lastScan.scanId}`}
          sourceId={browsing.id}
          scanId={browsing.lastScan.scanId}
          sourceName={browsing.displayName}
          onClose={() => setBrowsingId(null)}
          onRefresh={refreshAfterScan}
        />
      )}

      {available && scene?.lastScan && (
        <ScenePanel
          key={`${scene.id}:${scene.lastScan.scanId}`}
          sourceId={scene.id}
          scanId={scene.lastScan.scanId}
          sourceName={scene.displayName}
          onClose={() => setSceneId(null)}
          onRefresh={refreshAfterScan}
          onOpen2D={() => {
            setBrowsingId(scene.id);
            setSceneId(null);
          }}
        />
      )}

      <ScanJobsPanel
        available={available}
        blocked={disabled || selection !== null}
        sources={sources}
        onSettled={refreshAfterScan}
        onStarted={() => {
          setNotice(null);
          setError(null);
        }}
      />

      <div className="sources-footer">
        <p>
          A indexação está disponível somente para a pasta de teste
          .tools/fixtures/mvp-004 deste projeto, preparada com pnpm
          fixture:prepare. Selecione e autorize essa pasta antes de indexar.
          Para autorizar novamente uma fonte revogada, selecione a pasta outra
          vez.
        </p>
        <button
          className="text-button"
          type="button"
          disabled={!available || busy || loading || selection !== null}
          onClick={() => {
            setLoading(true);
            setError(null);
            setRefresh((current) => current + 1);
          }}
        >
          Atualizar lista
        </button>
      </div>
      {notice && (
        <p className="source-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="source-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
