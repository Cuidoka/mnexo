import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fileDetail,
  folderPage,
  rootPage,
} from '../../../tests/catalog-fixtures';
import {
  getNodeChildren,
  getNodeDetail,
  type NodeDetail,
  type NodePage,
} from '../../shared/api/catalog';
import { CatalogBrowser } from './CatalogBrowser';

vi.mock('../../shared/api/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/api/catalog')>()),
  getNodeChildren: vi.fn(),
  getNodeDetail: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getNodeChildren).mockImplementation(
    async (_source, _scan, folder) =>
      folder === folderPage.folder.node.id ? folderPage : rootPage,
  );
  vi.mocked(getNodeDetail).mockResolvedValue(fileDetail);
});
async function ready() {
  const onClose = vi.fn();
  const onRefresh = vi.fn();
  const view = render(
    <CatalogBrowser
      sourceId={rootPage.folder.sourceId}
      scanId={rootPage.folder.scanId}
      sourceName={rootPage.folder.sourceName}
      onClose={onClose}
      onRefresh={onRefresh}
    />,
  );
  await screen.findByRole('button', { name: 'Abrir pasta Coleção ç' });
  return { ...view, onClose, onRefresh, user: userEvent.setup() };
}
const metadata = () =>
  screen.getByRole('region', { name: 'Metadados do item' });

describe('T-009/T-044/T-048 — navegação 2D e detalhes reais do contrato', () => {
  it('carrega somente a primeira página e os metadados da raiz, sem buscar conteúdo', async () => {
    await ready();
    expect(getNodeChildren).toHaveBeenCalledExactlyOnceWith(
      rootPage.folder.sourceId,
      rootPage.folder.scanId,
      null,
    );
    expect(getNodeDetail).not.toHaveBeenCalled();
    expect(
      within(metadata()).getAllByText(rootPage.folder.path)[0],
    ).toBeInTheDocument();
    expect(
      within(metadata()).getByText('9.007.199.254.740.993 bytes'),
    ).toBeInTheDocument();
    expect(within(metadata()).getByText('Raiz da fonte')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Voltar à pasta pai' }),
    ).toBeDisabled();
  });
  it('entra na pasta vazia e volta pelo pai e pelo breadcrumb usando teclado', async () => {
    const { user } = await ready();
    await user.click(
      screen.getByRole('button', { name: 'Abrir pasta Coleção ç' }),
    );
    expect(
      await screen.findByText('Pasta vazia no índice.'),
    ).toBeInTheDocument();
    expect(within(metadata()).getByText('0 bytes')).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', {
      name: 'Caminho no índice',
    });
    expect(within(navigation).getAllByRole('button')).toHaveLength(2);
    await user.click(
      screen.getByRole('button', { name: 'Voltar à pasta pai' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Abrir pasta Coleção ç' }),
    );
    await screen.findByText('Pasta vazia no índice.');
    within(screen.getByRole('navigation', { name: 'Caminho no índice' }))
      .getByRole('button', { name: rootPage.folder.node.title })
      .focus();
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('button', { name: 'Abrir pasta Coleção ç' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Voltar à pasta pai' }),
    ).toBeDisabled();
  });
  it('seleciona arquivo e mostra caminho, tipo, tamanho, origem e pai retornados no DTO', async () => {
    const { user } = await ready();
    await user.click(
      screen.getByRole('button', {
        name: `Selecionar arquivo ${fileDetail.node.title}`,
      }),
    );
    expect(
      await within(metadata()).findByText(fileDetail.path),
    ).toBeInTheDocument();
    expect(getNodeDetail).toHaveBeenCalledExactlyOnceWith(
      fileDetail.sourceId,
      fileDetail.scanId,
      fileDetail.node.id,
    );
    expect(within(metadata()).getByText('Arquivo')).toBeInTheDocument();
    expect(
      within(metadata()).getByText('Sistema de arquivos'),
    ).toBeInTheDocument();
    await user.click(
      within(metadata()).getByRole('button', {
        name: rootPage.folder.node.title,
      }),
    );
    expect(
      await within(metadata()).findByText('Raiz da fonte'),
    ).toBeInTheDocument();
  });
  it('uma resposta antiga de detalhes não substitui a pasta recém-aberta', async () => {
    let finish!: (detail: NodeDetail) => void;
    vi.mocked(getNodeDetail).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { user } = await ready();
    await user.click(
      screen.getByRole('button', {
        name: `Selecionar arquivo ${fileDetail.node.title}`,
      }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Abrir pasta Coleção ç' }),
    );
    await screen.findByText('Pasta vazia no índice.');
    await act(async () => finish(fileDetail));
    expect(
      within(metadata()).queryByText(fileDetail.path),
    ).not.toBeInTheDocument();
    expect(within(metadata()).getByText('0 bytes')).toBeInTheDocument();
  });
  it('carrega mais itens por cursor e mantém seleção e breadcrumb', async () => {
    const extra = { ...fileDetail.node, id: 'item-extra', title: 'novo.txt' };
    vi.mocked(getNodeChildren)
      .mockResolvedValueOnce({ ...rootPage, nextCursor: fileDetail.node.id })
      .mockResolvedValueOnce({ ...rootPage, items: [extra], nextCursor: null });
    const { user } = await ready();
    await user.click(
      screen.getByRole('button', { name: 'Carregar mais itens' }),
    );
    expect(
      await screen.findByRole('button', {
        name: 'Selecionar arquivo novo.txt',
      }),
    ).toBeInTheDocument();
    expect(getNodeChildren).toHaveBeenLastCalledWith(
      fileDetail.sourceId,
      fileDetail.scanId,
      rootPage.folder.node.id,
      fileDetail.node.id,
    );
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(
      screen.queryByRole('button', { name: 'Carregar mais itens' }),
    ).not.toBeInTheDocument();
    expect(within(metadata()).getByText('Raiz da fonte')).toBeInTheDocument();
  });
  it('ignora página adicional que chega depois de navegar para outra pasta', async () => {
    let finish!: (page: NodePage) => void;
    vi.mocked(getNodeChildren)
      .mockResolvedValueOnce({ ...rootPage, nextCursor: fileDetail.node.id })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValue(folderPage);
    const { user } = await ready();
    await user.click(
      screen.getByRole('button', { name: 'Carregar mais itens' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Abrir pasta Coleção ç' }),
    );
    await screen.findByText('Pasta vazia no índice.');
    await act(async () => finish(rootPage));
    expect(screen.getByText('Pasta vazia no índice.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('falha de consulta não anuncia pasta vazia e permite tentar novamente sem detalhes privados', async () => {
    vi.mocked(getNodeChildren).mockRejectedValueOnce({
      code: 'DATABASE_UNAVAILABLE',
      message: 'SQL-privado',
    });
    render(
      <CatalogBrowser
        sourceId={fileDetail.sourceId}
        scanId={fileDetail.scanId}
        sourceName="Fixture"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(await screen.findByRole('alert')).not.toHaveTextContent(
      'SQL-privado',
    );
    expect(
      screen.queryByText('Pasta vazia no índice.'),
    ).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
  it('mudança de snapshot pede atualizar catálogo e não mistura páginas', async () => {
    vi.mocked(getNodeChildren)
      .mockResolvedValueOnce({ ...rootPage, nextCursor: fileDetail.node.id })
      .mockRejectedValueOnce({ code: 'INDEX_CHANGED' });
    const { user, onRefresh } = await ready();
    await user.click(
      screen.getByRole('button', { name: 'Carregar mais itens' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O índice mudou',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Atualizar catálogo' }),
    );
    expect(onRefresh).toHaveBeenCalledOnce();
  });
  it('pasta parcial sem filhos não é apresentada como vazia confirmada e nomes são texto', async () => {
    const unsafe = '<img src=x onerror=alert(1)>';
    vi.mocked(getNodeChildren).mockResolvedValueOnce({
      ...folderPage,
      folder: {
        ...folderPage.folder,
        node: { ...folderPage.folder.node, sizePartial: true, title: unsafe },
      },
    });
    const { container } = render(
      <CatalogBrowser
        sourceId={fileDetail.sourceId}
        scanId={fileDetail.scanId}
        sourceName="Fixture"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(
      await screen.findByText('Nenhum filho indexado nesta pasta parcial.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Pasta vazia no índice.'),
    ).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(within(metadata()).getByText(unsafe)).toBeInTheDocument();
  });
});
