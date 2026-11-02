# Builds "Kinship Atlas.exe" into the tree-app folder using the C# compiler built into Windows.
$ErrorActionPreference = 'Stop'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$appDir = Split-Path -Parent $PSScriptRoot
$out = Join-Path $appDir 'Kinship Atlas.exe'
& $csc /nologo /target:winexe /optimize+ "/out:$out" "/win32icon:$(Join-Path $PSScriptRoot 'kinship-atlas.ico')" /reference:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'KinshipAtlas.cs')
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
Write-Host "Built $out"
