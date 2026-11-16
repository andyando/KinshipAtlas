$appDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $appDir
$totalPass = 0; $totalFail = 0
Get-ChildItem tests\*.test.js | ForEach-Object {
  $out = (& node --test $_.FullName) | Out-String
  if ($out -match 'pass (\d+)') { $p = [int]$Matches[1] } else { $p = -1 }
  if ($out -match 'fail (\d+)') { $fl = [int]$Matches[1] } else { $fl = -1 }
  Write-Host ("{0}: pass={1} fail={2}" -f $_.Name, $p, $fl)
  $script:totalPass += [Math]::Max($p,0); $script:totalFail += [Math]::Max($fl,0)
}
Write-Host "TOTAL pass=$totalPass fail=$totalFail"
Pop-Location
