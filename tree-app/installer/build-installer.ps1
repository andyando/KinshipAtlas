param([string]$Compiler = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe")
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath $Compiler)) { throw "Inno Setup compiler missing: $Compiler. Install Inno Setup 6 or pass -Compiler." }
& (Join-Path $root 'tree-app\launcher\build-launcher.ps1')
& node (Join-Path $PSScriptRoot 'package-files.js')
if ($LASTEXITCODE -ne 0) { throw 'Package preparation failed.' }
& $Compiler (Join-Path $PSScriptRoot 'KinshipAtlas.iss')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
$installers = Get-ChildItem (Join-Path $root 'dist') -Filter 'KinshipAtlas-Setup-*.exe'
if (@($installers).Count -ne 1) { throw 'Keep dist limited to one release before building checksums.' }
$hash = (Get-FileHash -LiteralPath $installers.FullName -Algorithm SHA256).Hash.ToLower()
"$hash  $($installers.Name)" | Set-Content (Join-Path $root 'dist\SHA256SUMS') -Encoding ascii
