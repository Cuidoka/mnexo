import { useEffect, useState } from 'react';
import {
  DesktopRequiredError,
  getAppStatus,
  type AppStatus,
} from '../shared/api/app-status';

type ConnectionState =
  | { kind: 'loading' }
  | { kind: 'ready'; status: AppStatus }
  | { kind: 'error'; desktopRequired: boolean };

function FolderIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M9 19a5 5 0 0 1 5-5h13l6 7h17a5 5 0 0 1 5 5v23a5 5 0 0 1-5 5H14a5 5 0 0 1-5-5V19Z" />
      <path d="M10 28h44M25 40h14M32 33v14" />
    </svg>
  );
}

export function App() {
  const [connection, setConnection] = useState<ConnectionState>({
    kind: 'loading',
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    getAppStatus().then(
      (status) => {
        if (active) setConnection({ kind: 'ready', status });
      },
      (error: unknown) => {
        if (active) {
          setConnection({
            kind: 'error',
            desktopRequired: error instanceof DesktopRequiredError,
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [attempt]);

  function checkConnection() {
    setConnection({ kind: 'loading' });
    setAttempt((current) => current + 1);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo
      </a>

      <aside className="sidebar" aria-label="Navegação principal">
        <a className="brand" href="#main-content" aria-label="MNEXO, início">
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="m6 23 5-14 5 10 5-10 5 14M8 18h16" />
            <circle cx="16" cy="19" r="2.5" />
          </svg>
          <span>MNEXO</span>
        </a>
        <p className="sidebar-label">SEU ESPAÇO</p>
        <nav>
          <a className="nav-link" href="#main-content" aria-current="page">
            <span aria-hidden="true">▤</span> Fontes
          </a>
        </nav>
        <div className="sidebar-note">
          <span className="local-dot" aria-hidden="true" />
          <div>
            <strong>Seu universo começa aqui</strong>
            <p>Arquivos e ideias, conectados por você.</p>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <span>Seu espaço / Fontes</span>
          <span className="version-badge">Prévia · Etapa 0</span>
        </header>

        <main id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <p className="eyebrow">UM PONTO DE PARTIDA</p>
            <h1>Fontes</h1>
            <p>
              Escolha o que fará parte do seu universo. Suas pastas permanecem
              sob seu controle.
            </p>
          </div>

          <section className="sources-card" aria-labelledby="sources-title">
            <div className="section-heading">
              <h2 id="sources-title">Pastas do computador</h2>
              <span className="subtle-tag">Em preparação</span>
            </div>
            <div className="empty-state">
              <div className="folder-illustration">
                <FolderIcon />
              </div>
              <h3>Seu espaço ainda está vazio</h3>
              <p>
                A conexão de pastas estará disponível em uma próxima etapa. Você
                escolherá cada fonte antes de qualquer indexação.
              </p>
              <span className="privacy-note">
                Nenhuma pasta é examinada automaticamente.
              </span>
            </div>
          </section>

          <section className="status-card" aria-labelledby="status-title">
            <div className="status-heading">
              <div>
                <p className="eyebrow">NESTE DISPOSITIVO</p>
                <h2 id="status-title">Status do aplicativo</h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={checkConnection}
                disabled={connection.kind === 'loading'}
              >
                {connection.kind === 'loading'
                  ? 'Verificando…'
                  : 'Verificar novamente'}
              </button>
            </div>

            <div aria-live="polite" aria-atomic="true">
              {connection.kind === 'loading' && (
                <p className="connection-message" role="status">
                  <span className="status-dot pending" aria-hidden="true" />
                  Verificando a conexão local…
                </p>
              )}

              {connection.kind === 'ready' && (
                <div>
                  <p className="connection-message" role="status">
                    <span className="status-dot" aria-hidden="true" />
                    Conexão local verificada
                  </p>
                  <dl className="status-grid">
                    <div>
                      <dt>Versão</dt>
                      <dd>{connection.status.appVersion}</dd>
                    </div>
                    <div>
                      <dt>Banco local</dt>
                      <dd>
                        {connection.status.databaseStatus === 'ready'
                          ? 'Pronto'
                          : 'Indisponível'}
                      </dd>
                    </div>
                    <div>
                      <dt>Assistente de IA</dt>
                      <dd>Desativado</dd>
                    </div>
                  </dl>
                  {connection.status.databaseStatus === 'unavailable' && (
                    <div className="error-message" role="alert">
                      <strong>Não foi possível preparar o banco local</strong>
                      <p>
                        Tente verificar novamente. Se o problema continuar,
                        feche e reabra o aplicativo.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {connection.kind === 'error' && (
                <div className="error-message" role="alert">
                  <strong>
                    {connection.desktopRequired
                      ? 'Abra o aplicativo desktop'
                      : 'Não foi possível verificar a conexão local'}
                  </strong>
                  <p>
                    {connection.desktopRequired
                      ? 'Esta página no navegador permite visualizar a interface. A verificação local funciona na janela do MNEXO.'
                      : 'Tente novamente. Se o problema continuar, feche e reabra o aplicativo.'}
                  </p>
                </div>
              )}
            </div>
          </section>

          <footer className="page-footer">
            Construindo um lugar para os seus arquivos e as suas ideias.
          </footer>
        </main>
      </div>
    </div>
  );
}
