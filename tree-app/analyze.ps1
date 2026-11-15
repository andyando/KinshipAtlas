Set-Location 'g:\Git\Kinship_Experimental\tree-app'
$lines = (Get-Content app.js).Count
Write-Host "TOTAL LINES: $lines"
$funcs = Get-Content app.js | Select-String '^(?:\s{2})?function (\w+)\s*\(' | ForEach-Object {
  $n = $_.Matches[0].Groups[1].Value
  $ln = $_.LineNumber
  [pscustomobject]@{ Name = $n; Line = $ln }
}
Write-Host ("FUNCTIONS: {0}" -f $funcs.Count)
for ($i = 0; $i -lt $funcs.Count; $i++) {
  $end = if ($i -lt $funcs.Count - 1) { $funcs[$i + 1].Line - 1 } else { $lines }
  Write-Host ("{0}`t{1}`t{2}" -f $funcs[$i].Name, $funcs[$i].Line, ($end - $funcs[$i].Line + 1))
}
