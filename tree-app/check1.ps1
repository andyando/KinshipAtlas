Set-Location 'g:\Git\Kinship_Experimental\tree-app'
node --check app.js
Write-Output "app.js check exit: $LASTEXITCODE"
if (Test-Path modules) { Get-ChildItem modules | ForEach-Object { $_.Name } } else { Write-Output 'no modules dir' }
git status --short
