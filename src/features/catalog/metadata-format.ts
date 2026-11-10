export function formatBytes(value: string | null): string {
  return value === null
    ? 'Indisponível'
    : `${BigInt(value).toLocaleString('pt-BR')} bytes`;
}
export function formatFilesystemDate(value: string | null): string {
  if (value === null) return 'Indisponível';
  const milliseconds = BigInt(value);
  if (milliseconds < -8640000000000000n || milliseconds > 8640000000000000n) {
    return `${value} ms desde 1970 (fora do intervalo de exibição)`;
  }
  return new Date(Number(milliseconds)).toLocaleString('pt-BR');
}
