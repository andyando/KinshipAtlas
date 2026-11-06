param([Parameter(Mandatory = $true)][string]$Installer)
$ErrorActionPreference = 'Stop'
$Installer = (Resolve-Path -LiteralPath $Installer).Path
$testRoot = Join-Path $env:TEMP ('kinship-installer-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    $app = Join-Path $testRoot 'app'
    New-Item -ItemType Directory -Path $app | Out-Null
    $fixtures = @{
        'index.html' = '<html>Old synthetic app</html>'
        'version.js' = "window.KINSHIP_VERSION = { releases: [{ version: '1.8.0' }] };"
        'primary-data.js' = 'window.KINSHIP_PRIMARY = null;'
        'kinship-defaults.json' = '{"gedcom":{"name":"Example.ged"}}'
        'kinship-selections.json' = '{"example":"synthetic-selection"}'
        'Primary GEDCOM\Example.ged' = "0 HEAD`n0 @I1@ INDI`n1 NAME Example /Person/`n0 TRLR"
        'Primary Media Library\Example_media\photo.svg' = '<svg xmlns="http://www.w3.org/2000/svg"/>'
        'custom_media\photo.svg' = '<svg xmlns="http://www.w3.org/2000/svg"/>'
    }
    $protected = @{}
    foreach ($name in $fixtures.Keys) {
        $file = Join-Path $app $name
        New-Item -ItemType Directory -Path (Split-Path -Parent $file) -Force | Out-Null
        [IO.File]::WriteAllText($file, $fixtures[$name])
        if ($name -notin @('index.html', 'version.js')) { $protected[$name] = (Get-FileHash -LiteralPath $file).Hash }
    }
    $process = Start-Process -FilePath $Installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',("/DIR=`"$app`"") -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Fixture upgrade failed: $($process.ExitCode)" }
    foreach ($name in $protected.Keys) {
        if ((Get-FileHash -LiteralPath (Join-Path $app $name)).Hash -ne $protected[$name]) {
            throw "Personal fixture was changed: $name"
        }
    }
    foreach ($name in @('index.html', 'release-check.js', 'Kinship Atlas.exe', 'welcome-pattern.svg')) {
        if (-not (Test-Path -LiteralPath (Join-Path $app $name))) { throw "Missing runtime file: $name" }
    }
    if (Test-Path -LiteralPath (Join-Path $app 'updater.js')) { throw 'Retired browser updater was installed.' }
    [IO.File]::WriteAllText((Join-Path $app 'version.js'), "version: '99.0.0'")
    $before = (Get-FileHash -LiteralPath (Join-Path $app 'index.html')).Hash
    $process = Start-Process -FilePath $Installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',("/DIR=`"$app`"") -Wait -PassThru
    if ($process.ExitCode -eq 0) { throw 'Unallocated future version was accepted.' }
    if ((Get-FileHash -LiteralPath (Join-Path $app 'index.html')).Hash -ne $before) { throw 'Rejected upgrade changed app files.' }
    $fresh = Join-Path $testRoot 'fresh'
    $process = Start-Process -FilePath $Installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',("/DIR=`"$fresh`"") -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Fresh installation failed: $($process.ExitCode)" }
    if (Test-Path -LiteralPath (Join-Path $fresh 'primary-data.js')) { throw 'Personal bootstrap was packaged.' }
    Write-Output 'Installer preservation, version rejection and fresh-install tests passed.'
} finally {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}
