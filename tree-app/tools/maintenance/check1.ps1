$appDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $appDir
node --check app.js
Write-Output "app.js check exit: $LASTEXITCODE"
if (Test-Path src\modules) { Get-ChildItem src\modules | ForEach-Object { $_.Name } } else { Write-Output 'no source modules dir' }
git status --short
Pop-Location
