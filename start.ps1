$ErrorActionPreference = 'Stop'
$localNode = 'C:\Users\dariu\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$node = if (Get-Command node -ErrorAction SilentlyContinue) { (Get-Command node).Source } elseif (Test-Path $localNode) { $localNode } else { throw 'Node.js was not found.' }
Set-Location $PSScriptRoot
Write-Host 'Materia is starting at http://127.0.0.1:4173/' -ForegroundColor Green
& $node '.\server.mjs'
