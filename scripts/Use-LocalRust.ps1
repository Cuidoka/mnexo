# Dot-source: . .\scripts\Use-LocalRust.ps1
# Configura somente o processo PowerShell atual; não altera o PATH permanente.
$mnexoRoot = Split-Path -Parent $PSScriptRoot
$mnexoCargoHome = Join-Path $mnexoRoot '.tools\cargo'
$mnexoRustupHome = Join-Path $mnexoRoot '.tools\rustup'

if (-not (Test-Path -LiteralPath (Join-Path $mnexoCargoHome 'bin\cargo.exe'))) {
    throw 'Rust local indisponível. Consulte o README para usar Rust global ou preparar .tools.'
}

$env:CARGO_HOME = $mnexoCargoHome
$env:RUSTUP_HOME = $mnexoRustupHome
$env:PATH = (Join-Path $mnexoCargoHome 'bin') + [IO.Path]::PathSeparator + $env:PATH
