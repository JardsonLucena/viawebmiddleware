#Requires -RunAsAdministrator
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$WinSwPath,
  [string]$NodePath = (Get-Command node -ErrorAction Stop).Source
)

$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendPath = Join-Path $projectPath 'backend'
$entryPath = Join-Path $backendPath 'dist\server.js'
$frontendPath = Join-Path $projectPath 'frontend\dist\index.html'
$servicePath = Join-Path $projectPath 'windows-service'
$wrapperPath = Join-Path $servicePath 'ViawebMiddleware.exe'
$configPath = Join-Path $servicePath 'ViawebMiddleware.xml'

foreach ($requiredPath in @($WinSwPath, $NodePath, $entryPath, $frontendPath, (Join-Path $backendPath '.env'))) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Required file missing: $requiredPath"
  }
}
if (Get-Service -Name 'ViawebMiddleware' -ErrorAction SilentlyContinue) {
  throw 'ViawebMiddleware is already installed. Use Restart-Service ViawebMiddleware after updating the build.'
}

New-Item -ItemType Directory -Path $servicePath -Force | Out-Null
Copy-Item -LiteralPath $WinSwPath -Destination $wrapperPath
$nodeXml = [System.Security.SecurityElement]::Escape((Resolve-Path -LiteralPath $NodePath).Path)
$backendXml = [System.Security.SecurityElement]::Escape($backendPath)
$entryXml = [System.Security.SecurityElement]::Escape($entryPath)
$logXml = [System.Security.SecurityElement]::Escape((Join-Path $servicePath 'logs'))
$configuration = @"
<service>
  <id>ViawebMiddleware</id>
  <name>VIAWEB Show Cam Middleware</name>
  <description>VIAWEB Receiver integration and operator web console.</description>
  <executable>$nodeXml</executable>
  <arguments>&quot;$entryXml&quot;</arguments>
  <workingdirectory>$backendXml</workingdirectory>
  <env name="NODE_ENV" value="production"/>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <stoptimeout>15 sec</stoptimeout>
  <onfailure action="restart" delay="15 sec"/>
  <logpath>$logXml</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>5</keepFiles>
  </log>
</service>
"@
[System.IO.File]::WriteAllText($configPath, $configuration, [System.Text.UTF8Encoding]::new($false))
& $wrapperPath install
if ($LASTEXITCODE -ne 0) { throw 'WinSW service installation failed.' }
& $wrapperPath start
if ($LASTEXITCODE -ne 0) { throw 'Service installed but could not start. Check windows-service\logs.' }
Get-Service -Name 'ViawebMiddleware'
