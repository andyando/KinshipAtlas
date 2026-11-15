Set-Location 'g:\Git\Kinship_Experimental\tree-app'
$matches2 = Select-String -Path app.js -Pattern '^\s*(//\s*[A-Z][A-Za-z /&-]{6,}|\*{2,}|/\*|//\s*={3,})'
foreach ($m in $matches2) { "{0}: {1}" -f $m.LineNumber, $m.Line.Trim() }
