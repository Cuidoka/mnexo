# ADR 0001 — Fundação desktop isolada

Data: 2026-10-29

Status: **proposto**

## Contexto

O pacote recebido contém especificação e regras, sem implementação ou schema SQL. O usuário autorizou começar pelo MVP-001. A proposta P-002 precisa de validação real de janela e IPC no Windows.

## Opções comparadas

- Tauri 2 + Rust + React/TypeScript: segue P-002 e mantém operações locais atrás de comandos estreitos.
- Electron: alternativa da especificação, sem evidência atual que justifique mudar a proposta.
- Interface apenas web: útil para prévia visual, mas não comprova o backend desktop.

## Decisão proposta e experimento autorizado

Exercitar Tauri 2 e React/TypeScript com somente `get_app_status`. O banco permanece explicitamente não inicializado até o MVP-002. Restringir o comando pelo manifesto de aplicação e capability da janela principal, sem plugins de filesystem, shell ou rede.

Rust foi instalado dentro de `.tools` porque não estava disponível no ambiente. O pnpm também usa cache local. O script de ativação afeta somente o processo atual. Essa escolha facilita reproduzir o incremento sem modificar permanentemente o PATH do usuário, ao custo de espaço em disco no checkout.

## Consequências e rollback

A fundação valida UI e IPC; não valida scanner, SQLite ou GPU. Dependências JS e Rust têm lockfiles. O canal Rust instalado é stable, cuja versão observada está no README; reproduções devem usar a mesma versão para comparar resultados.

Os três documentos originais são preservados. O rollback do código deve ocorrer por revisão e reversão dos arquivos do incremento, sem comandos destrutivos ou alteração de arquivos pessoais externos. Não há migração ou banco a desfazer nesta etapa.

## Referências

- <https://v2.tauri.app/security/capabilities/>
- <https://v2.tauri.app/start/prerequisites/>
- <https://rust-lang.github.io/rustup/installation/index.html>
