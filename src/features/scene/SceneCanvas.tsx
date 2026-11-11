import { useEffect, useRef, useState } from 'react';
import type { SceneProjection } from '../../shared/api/scene';
import { mountScene, type SceneSession } from './scene-renderer';

export function SceneCanvas({ projection }: { projection: SceneProjection }) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(
    'loading',
  );
  useEffect(() => {
    let active = true;
    let session: SceneSession | undefined;
    Promise.resolve()
      .then(() => {
        if (!active || !container.current) return;
        session = mountScene(container.current, projection, () => {
          if (active) setStatus('failed');
        });
        if (active) setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('failed');
      });
    return () => {
      active = false;
      session?.dispose();
    };
  }, [projection]);
  return (
    <>
      {status === 'loading' && <p role="status">Preparando cena 3D…</p>}
      {status === 'failed' && (
        <p role="alert">
          A cena 3D ficou indisponível. Você pode consultar os mesmos metadados
          no índice 2D.
        </p>
      )}
      <div
        ref={container}
        className="scene-viewport"
        hidden={status === 'failed'}
        role="img"
        aria-label={`Cena 3D de ${projection.nodes.length + 1} nós do índice. Pastas contêm seus filhos; a relação textual está disponível abaixo.`}
      />
    </>
  );
}
