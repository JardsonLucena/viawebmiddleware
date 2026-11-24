#Requires -RunAsAdministrator
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$configPath = Join-Path $projectPath 'windows-service\ViawebMiddleware.xml'
$document = New-Object System.Xml.XmlDocument
$document.Load($configPath)
$timeout = $document.SelectSingleNode('/service/stoptimeout')
if (-not $timeout) {
  $timeout = $document.CreateElement('stoptimeout')
  [void]$document.DocumentElement.AppendChild($timeout)
}
$timeout.InnerText = '15 sec'
Copy-Item -LiteralPath $configPath -Destination "$configPath.bak" -Force
$document.Save($configPath)
Write-Output 'Stop timeout configured to 15 seconds. The updated wrapper configuration applies on the next service start.'
