# Phase 2 helper — responsibility snapshot of app.js (sections & counts)
# Read-only: prints section banner lines and function counts. Modifies nothing.
Set-Location 'g:\Git\Kinship_Experimental\tree-app'

$src = Get-Content app.js -Raw
$lines = (Get-Content app.js).Count

Write-Output ("TOTAL LINES: {0}" -f $lines)

Write-Output "`n== SECTION BANNERS =="
Select-String -Path app.js -Pattern '^\s*/?\*\*\*\s*SECTION|^// =====|^/\* =+' | ForEach-Object {
  "{0,5}: {1}" -f $_.LineNumber, $_.Line.Trim()
}

Write-Output "`n== TOP-LEVEL FUNCTION DECLARATIONS =="
$funcCount = (Select-String -Path app.js -Pattern '^\s*(async\s+)?function\s+[A-Za-z_$]').Count
Write-Output ("function declarations: {0}" -f $funcCount)

$arrowCount = (Select-String -Path app.js -Pattern '^\s*(const|let)\s+[A-Za-z_$]+\s*=\s*(async\s*)?\(').Count
Write-Output ("const/let arrow-function assignments: {0}" -f $arrowCount)

Write-Output "`n== LARGEST FUNCTIONS (approx, by blank-line-delimited block) =="
# crude but useful: measure distance between consecutive top-level 'function name(' lines
$decls = Select-String -Path app.js -Pattern '^(async\s+)?function\s+([A-Za-z_$]+)'
for ($i = 0; $i -lt $decls.Count; $i++) {
  $start = $decls[$i].LineNumber
  $end = if ($i + 1 -lt $decls.Count) { $decls[$i + 1].LineNumber } else { $lines }
  $size = $end - $start
  if ($size -ge 60) { "{0,5} lines  {1}  (starts line {2})" -f $size, $decls[$i].Matches[0].Groups[2].Value, $start }
}
