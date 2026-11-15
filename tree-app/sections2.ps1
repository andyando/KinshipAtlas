Set-Location 'g:\Git\Kinship_Experimental\tree-app'
Select-String -Path app.js -Pattern '// \d+\.' | ForEach-Object {
  '{0,5}: {1}' -f $_.LineNumber, $_.Line.Trim()
}
