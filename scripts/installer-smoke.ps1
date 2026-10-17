$ErrorActionPreference='Stop'
if(Get-Process -Name 'Daidar Flow Pilot' -ErrorAction SilentlyContinue){throw 'Close the running pilot app before running the installer smoke test.'}
$taskWorkspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskInstall=[System.IO.Path]::GetFullPath((Join-Path $taskWorkspace 'test-results\installed-pilot'))
if (-not $taskInstall.StartsWith($taskWorkspace+[System.IO.Path]::DirectorySeparatorChar,[System.StringComparison]::OrdinalIgnoreCase)) { throw 'Test install outside workspace' }
$taskInstaller=Join-Path $taskWorkspace 'release\Daidar Flow Pilot Setup 0.2.0.exe'
$taskP=Start-Process -FilePath $taskInstaller -ArgumentList "/S /D=$taskInstall" -WindowStyle Hidden -PassThru
if (-not $taskP.WaitForExit(60000)) { throw 'Installer timeout' }
if ($taskP.ExitCode -ne 0) { throw "Installer exit $($taskP.ExitCode)" }
$taskExe=Join-Path $taskInstall 'Daidar Flow Pilot.exe'
if (-not (Test-Path -LiteralPath $taskExe)) { throw 'Installed executable missing' }
$taskBefore=(& node (Join-Path $PSScriptRoot 'installer-ready.cjs')) | ConvertFrom-Json
$taskApp=Start-Process -FilePath $taskExe -WorkingDirectory $taskWorkspace -WindowStyle Hidden -PassThru
$taskReady=$false
for ($taskTry=0;$taskTry -lt 20;$taskTry++) {
 Start-Sleep -Milliseconds 500
 $taskApp.Refresh()
 if ($taskApp.HasExited) { throw "Application exited $($taskApp.ExitCode)" }
 $taskAfter=(& node (Join-Path $taskWorkspace 'test-results\ready-count.cjs')) | ConvertFrom-Json
 if ($taskAfter.count -gt $taskBefore.count) { $taskReady=$true; break }
}
if (-not $taskReady) { $taskApp.Kill($true);throw 'Renderer never completed bootstrap' }
$taskApp.Kill($true)
$taskApp.WaitForExit()
$taskUninstall=Join-Path $taskInstall 'Uninstall Daidar Flow Pilot.exe'
$taskU=Start-Process -FilePath $taskUninstall -ArgumentList '/S' -WindowStyle Hidden -PassThru
if (-not $taskU.WaitForExit(60000)) { throw 'Uninstaller timeout' }
for ($taskTry=0;$taskTry -lt 60 -and (Test-Path -LiteralPath $taskExe);$taskTry++) { Start-Sleep -Milliseconds 500 }
$taskPreserved=Test-Path -LiteralPath (Join-Path $env:APPDATA 'Daidar Flow Pilot\flow.sqlite')
$taskResult=[pscustomobject]@{installed=$true;rendererBootstrap=$taskReady;uninstalled=(-not(Test-Path -LiteralPath $taskExe));dataPreserved=$taskPreserved;schema=$taskAfter.schema;signature=(Get-AuthenticodeSignature -LiteralPath $taskInstaller).Status.ToString();testedAt=(Get-Date).ToUniversalTime().ToString('o')}
$taskResult | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskWorkspace 'test-results\installer-smoke.json') -Encoding utf8
$taskResult | ConvertTo-Json
