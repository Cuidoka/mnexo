import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelScan,
  getScanStatus,
  jobActive,
  startScan,
  type ScanJob,
} from '../../shared/api/scan-jobs';
import {
  sourceErrorMessage,
  type ScanSource,
} from '../../shared/api/scan-sources';

const labels = {
  running: 'Indexação em andamento',
  cancelling: 'Cancelamento solicitado',
  publishing: 'Salvando o índice',
  completed: 'Varredura concluída',
  cancelled: 'Varredura cancelada',
  failed: 'Falha na indexação',
};

export function ScanJobsPanel({
  available,
  blocked,
  sources,
  onSettled,
  onStarted,
}: {
  available: boolean;
  blocked: boolean;
  sources: ScanSource[];
  onSettled: () => void;
  onStarted?: () => void;
}) {
  const [job, setJob] = useState<ScanJob | null>(null);
  const [reliable, setReliable] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const mutation = useRef(false);
  const mounted = useRef(false);
  const lastSettled = useRef<string | null>(null);
  const accept = useCallback(
    (current: ScanJob | null) => {
      setJob(current);
      setReliable(true);
      setError(null);
      if (
        current &&
        !jobActive(current) &&
        lastSettled.current !== current.jobId
      ) {
        lastSettled.current = current.jobId;
        onSettled();
      }
    },
    [onSettled],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!available) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const version = revision.current;
      if (!mutation.current) {
        try {
          const current = await getScanStatus();
          if (!disposed && version === revision.current) accept(current);
        } catch {
          if (!disposed && version === revision.current) {
            setReliable(false);
            setError(
              'Não foi possível consultar o andamento. Tentaremos novamente; o último estado conhecido continua visível.',
            );
          }
        }
      }
      if (!disposed) timer = setTimeout(() => void poll(), 400);
    }
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      revision.current += 1;
    };
  }, [available, accept]);

  async function change(operation: () => Promise<ScanJob>) {
    if (mutation.current) return;
    mutation.current = true;
    const version = ++revision.current;
    setMutating(true);
    setError(null);
    try {
      const result = await operation();
      if (mounted.current && version === revision.current) accept(result);
    } catch (failure) {
      if (mounted.current && version === revision.current)
        setError(sourceErrorMessage(failure));
    } finally {
      mutation.current = false;
      if (mounted.current) setMutating(false);
    }
  }

  const active = jobActive(job);
  return (
    <section className="scan-jobs" aria-labelledby="scan-jobs-title">
      <h3 id="scan-jobs-title">Andamento da indexação</h3>
      {!job && (
        <p>
          {reliable
            ? 'Nenhuma varredura iniciada nesta sessão.'
            : 'Consultando o andamento…'}
        </p>
      )}
      {job && (
        <>
          <p role="status">{labels[job.state]}</p>
          {active && <progress aria-label="Varredura sem total conhecido" />}
          {job.state === 'cancelling' && (
            <p>
              Aguardando a operação local em curso terminar para confirmar o
              cancelamento.
            </p>
          )}
          {job.state === 'publishing' && (
            <p>
              O resultado está sendo salvo. O cancelamento já não está
              disponível.
            </p>
          )}
          <dl className="scan-counts">
            <div>
              <dt>Entradas visitadas</dt>
              <dd>{job.progress.visitedEntries}</dd>
            </div>
            <div>
              <dt>Arquivos encontrados</dt>
              <dd>{job.progress.filesCount}</dd>
            </div>
            <div>
              <dt>Pastas encontradas</dt>
              <dd>{job.progress.foldersCount}</dd>
            </div>
            <div>
              <dt>Bytes encontrados</dt>
              <dd>{BigInt(job.progress.totalBytes).toLocaleString('pt-BR')}</dd>
            </div>
            <div>
              <dt>Ignoradas / ocorrências</dt>
              <dd>
                {job.progress.skippedCount} / {job.progress.errorCount}
              </dd>
            </div>
          </dl>
          {job.state === 'running' && (
            <button
              className="secondary-button"
              type="button"
              disabled={!available || mutating}
              onClick={() => void change(() => cancelScan(job.jobId))}
            >
              Cancelar varredura
            </button>
          )}
          {job.state === 'cancelled' && (
            <p>
              O índice anterior foi preservado. Uma nova varredura começa do
              início.
            </p>
          )}
          {job.state === 'failed' && (
            <p className="source-error" role="alert">
              {sourceErrorMessage({ code: job.errorCode })}
            </p>
          )}
        </>
      )}
      {sources
        .filter((source) => source.fixtureEligible && source.authorized)
        .map((source) => (
          <button
            className="primary-button"
            type="button"
            key={source.id}
            disabled={!available || blocked || !reliable || active || mutating}
            onClick={() => {
              onStarted?.();
              void change(() => startScan(source.id));
            }}
          >
            Indexar metadados da fixture
          </button>
        ))}
      {error && (
        <p className="source-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
