import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Somente dados sintéticos neste caminho fixo; nunca sobrescrever arquivos.
const project = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(project, '.tools', 'fixtures', 'mvp-004');
async function ensureDirectory(directory) {
  if (directory !== path.parse(directory).root) {
    await ensureDirectory(path.dirname(directory));
  }
  try {
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error(`Diretório de fixture inválido: ${directory}`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(directory);
  }
}
await ensureDirectory(path.join(root, 'Coleção ç', 'Vazia'));
for (const [relative, content] of [
  ['raiz.txt', 'Fixture sintetica MNEXO.\n'],
  ['Coleção ç/notas com espaço.txt', 'Dados de teste.\n'],
  ['Coleção ç/zero.bin', ''],
]) {
  const target = path.join(root, relative);
  try {
    await writeFile(target, content, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isFile()) throw error;
    // Um arquivo existente pertence ao usuário; preservá-lo integralmente.
  }
}
console.log(`Fixture disponível (arquivos existentes preservados): ${root}`);
