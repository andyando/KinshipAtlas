$t = Get-Content 'C:\Users\agand\AppData\Local\Temp\funcs.txt' | Select-Object -Skip 2 | ForEach-Object {
  $p = $_ -split "`t"
  [pscustomobject]@{ N = $p[0]; L = [int]$p[1]; C = [int]$p[2] }
}
Write-Host ("TOTAL FUNCTIONS: " + $t.Count)
Write-Host "LARGEST:"
$t | Sort-Object C -Descending | Select-Object -First 30 | ForEach-Object { "{0,5}  {1}" -f $_.C, $_.N }
Write-Host "SIZE BUCKETS:"
Write-Host (">500 lines: " + ($t | Where-Object { $_.C -gt 500 }).Count)
Write-Host ("200-500:     " + ($t | Where-Object { $_.C -gt 200 -and $_.C -le 500 }).Count)
Write-Host ("100-200:     " + ($t | Where-Object { $_.C -gt 100 -and $_.C -le 200 }).Count)
Write-Host ("<=100:       " + ($t | Where-Object { $_.C -le 100 }).Count)
