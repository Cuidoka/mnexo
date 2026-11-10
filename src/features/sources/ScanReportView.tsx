import { issueLabels, type ScanReport } from '../../shared/api/scan-report';

export function ScanReportView({ report }: { report: ScanReport }) {
  return (
    <section className="scan-report" aria-label="Último relatório de indexação">
      <h4>{report.partial ? 'Indexação parcial' : 'Indexação concluída'}</h4>
      <p>
        Última execução:{' '}
        <time dateTime={report.completedAt}>
          {new Date(report.completedAt).toLocaleString('pt-BR')}
        </time>
      </p>
      <dl className="scan-counts">
        <div>
          <dt>Arquivos</dt>
          <dd>{report.filesCount}</dd>
        </div>
        <div>
          <dt>Pastas (inclui raiz)</dt>
          <dd>{report.foldersCount}</dd>
        </div>
        <div>
          <dt>Bytes indexados</dt>
          <dd>{BigInt(report.totalBytes).toLocaleString('pt-BR')}</dd>
        </div>
        <div>
          <dt>Entradas ignoradas</dt>
          <dd>{report.skippedCount}</dd>
        </div>
        <div>
          <dt>Ocorrências</dt>
          <dd>{report.errorCount}</dd>
        </div>
      </dl>
      {report.partial && (
        <p>
          Totais parciais dos arquivos acessíveis. Confira as ocorrências
          abaixo.
        </p>
      )}
      {report.issues.length > 0 && (
        <details>
          <summary>Ver relatório de erros e exclusões</summary>
          <ul>
            {report.issues.map((issue, index) => (
              <li key={index}>
                <span className="source-path">{issue.relativePath}</span>:{' '}
                {issueLabels[issue.code]}
              </li>
            ))}
          </ul>
          {report.issuesTruncated && (
            <p>
              Exibindo as primeiras 100 ocorrências; o total está nas contagens.
            </p>
          )}
        </details>
      )}
    </section>
  );
}
