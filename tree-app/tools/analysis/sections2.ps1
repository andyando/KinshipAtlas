$appDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $appDir
try {
  Select-String -Path app.js -Pattern '// \d+\.' | ForEach-Object {
    '{0,5}: {1}' -f $_.LineNumber, $_.Line.Trim()
  }
} finally { Pop-Location }
