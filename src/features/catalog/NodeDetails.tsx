import type { NodeDetail } from '../../shared/api/catalog';
import { formatBytes, formatFilesystemDate } from './metadata-format';

export function NodeDetails({
  detail,
  onParent,
}: {
  detail: NodeDetail;
  onParent: (id: string) => void;
}) {
  return (
    <section className="node-details" aria-labelledby="node-details-title">
      <h3 id="node-details-title">Metadados do item</h3>
      <h4>{detail.node.title}</h4>
      <dl>
        <dt>Caminho indexado</dt>
        <dd className="source-path">{detail.path}</dd>
        <dt>Tipo</dt>
        <dd>{detail.node.kind === 'folder' ? 'Pasta' : 'Arquivo'}</dd>
        <dt>Tamanho lógico</dt>
        <dd>
          {formatBytes(detail.node.sizeBytes)}
          {detail.node.sizePartial && ' (parcial)'}
        </dd>
        <dt>Criado em</dt>
        <dd>{formatFilesystemDate(detail.createdAtMs)}</dd>
        <dt>Modificado em</dt>
        <dd>{formatFilesystemDate(detail.node.modifiedAtMs)}</dd>
        <dt>Pasta pai</dt>
        <dd>
          {detail.parent ? (
            <button
              className="text-button"
              type="button"
              onClick={() => onParent(detail.parent!.id)}
            >
              {detail.parent.title}
            </button>
          ) : (
            'Raiz da fonte'
          )}
        </dd>
        <dt>Fonte</dt>
        <dd>
          {detail.sourceName}
          <p className="source-path">{detail.sourceRootPath}</p>
        </dd>
        <dt>Origem</dt>
        <dd>Sistema de arquivos</dd>
        <dt>Data do índice</dt>
        <dd>
          <time dateTime={detail.indexedAt}>
            {new Date(detail.indexedAt).toLocaleString('pt-BR')}
          </time>
        </dd>
      </dl>
    </section>
  );
}
