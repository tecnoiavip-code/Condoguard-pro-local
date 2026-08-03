# PortalGuard - Launcher da Portaria
# Inicia o servidor local, abre o PortalGuard no navegador e encerra o
# servidor automaticamente quando a janela do programa for fechada.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

$port = 8080

# Detecta o IP da maquina na rede local (interface da rota padrao), com
# fallback para 127.0.0.1. O PortalGuard e aberto nesse IP para que os
# dispositivos Control iD (na mesma rede) consigam alcancar o webhook.
function Get-LanIp {
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        ($_.PrefixOrigin -ne 'WellKnown') -and
        ($null -eq $route -or $_.InterfaceIndex -eq $route.ifIndex)
    } | Select-Object -First 1
    if ($ip) { return $ip.IPAddress }
    return '127.0.0.1'
}

$lanIp = Get-LanIp
$url = "http://${lanIp}:${port}"

function Test-PortOpen {
    param([int]$PortNumber)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect('127.0.0.1', $PortNumber, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne(1500)) { return $false }
        $client.EndConnect($iar)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

Write-Host ''
Write-Host '==============================================' -ForegroundColor Cyan
Write-Host '  PortalGuard - Portaria Local' -ForegroundColor Cyan
Write-Host '==============================================' -ForegroundColor Cyan
Write-Host ''

# 1. Garante o build do frontend (na primeira vez)
if (-not (Test-Path (Join-Path $root 'dist\index.html'))) {
    Write-Host 'Primeira execucao: compilando o programa (pode levar ~1 min)...' -ForegroundColor Yellow
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Falha na compilacao do programa.' -ForegroundColor Red
        Read-Host 'Pressione ENTER para sair'
        exit 1
    }
}

# 2. Verifica se o servidor ja esta rodando
$alreadyUp = Test-PortOpen -PortNumber $port

$nodeProc = $null
$serverStartedByUs = $false

if (-not $alreadyUp) {
    Write-Host 'Iniciando o servidor local...'
    $nodeProc = Start-Process -FilePath 'node' -ArgumentList 'server/index.js' -WorkingDirectory $root -PassThru -WindowStyle Hidden
    $serverStartedByUs = $true

    $ready = $false
    for ($i = 0; $i -lt 100; $i++) {
        Start-Sleep -Milliseconds 250
        if (Test-PortOpen -PortNumber $port) { $ready = $true; break }
        if ($nodeProc.HasExited) { break }
    }

    if (-not $ready) {
        Write-Host 'O servidor nao respondeu. Verifique se a porta 8080 esta em uso.' -ForegroundColor Red
        if (-not $nodeProc.HasExited) { Stop-Process -Id $nodeProc.Id -Force }
        Read-Host 'Pressione ENTER para sair'
        exit 1
    }
    Write-Host "Servidor no ar em $url" -ForegroundColor Green
} else {
    Write-Host "Servidor ja estava rodando em $url" -ForegroundColor Green
}

# 3. Abre o programa em uma janela dedicada do navegador (Chrome em modo aplicativo)
$browserProc = $null
$profile = Join-Path $env:LOCALAPPDATA 'PortalGuard\browser-profile'
New-Item -ItemType Directory -Force -Path $profile | Out-Null

$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
$edge = @("$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($chrome) {
    $browserProc = Start-Process -FilePath $chrome -ArgumentList "--user-data-dir=$profile", '--force-device-scale-factor=1.1', "--app=$url" -PassThru
} elseif ($edge) {
    $browserProc = Start-Process -FilePath $edge -ArgumentList "--user-data-dir=$profile", '--force-device-scale-factor=1.1', "--app=$url" -PassThru
} else {
    $browserProc = Start-Process -FilePath $url -PassThru
}

Write-Host ''
Write-Host 'PortalGuard aberto no navegador (modo aplicativo, zoom 110%).' -ForegroundColor Green
Write-Host 'Dicas: Ctrl + ou Ctrl - para ajustar o zoom, Ctrl + 0 para 100%.' -ForegroundColor Yellow
Write-Host 'FECHE a janela do PortalGuard para encerrar o servidor automaticamente.' -ForegroundColor Yellow
Write-Host ''

# 4. Aguarda o fechamento da janela do navegador
if ($browserProc -and -not $browserProc.HasExited) {
    try { $browserProc.WaitForExit() } catch { }
} else {
    # Sem Edge/Chrome: usa o navegador padrao e aguarda o usuario encerrar
    Read-Host 'Para encerrar o servidor, pressione ENTER aqui'
}

# 5. Encerra o servidor (somente se foi iniciado por este script)
if ($serverStartedByUs -and $nodeProc -and -not $nodeProc.HasExited) {
    Write-Host 'Encerrando o servidor...'
    try { Stop-Process -Id $nodeProc.Id -Force } catch { }
    Start-Sleep -Milliseconds 500
}

Write-Host 'Programa encerrado. Pode fechar esta janela.' -ForegroundColor Yellow
Start-Sleep -Seconds 2
