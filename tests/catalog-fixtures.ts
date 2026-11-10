import fixture from './fixtures/catalog-page.json';
import {
  parseNodePage,
  type NodeDetail,
  type NodePage,
} from '../src/shared/api/catalog';

export const rootPage = parseNodePage(fixture);
export const folderPage: NodePage = {
  folder: {
    ...rootPage.folder,
    node: rootPage.items[0],
    path: `${rootPage.folder.path}\\Coleção ç`,
    createdAtMs: null,
    parent: rootPage.breadcrumbs[0],
  },
  breadcrumbs: [
    ...rootPage.breadcrumbs,
    { id: rootPage.items[0].id, title: rootPage.items[0].title },
  ],
  items: [],
  nextCursor: null,
};
export const fileDetail: NodeDetail = {
  ...rootPage.folder,
  node: rootPage.items[1],
  path: `${rootPage.folder.path}\\áudio com espaço.wav`,
  parent: rootPage.breadcrumbs[0],
};
