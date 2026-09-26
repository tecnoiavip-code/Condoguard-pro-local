# PortalGuard - Launcher da Portaria
# Inicia o servidor local, abre o PortalGuard no navegador e encerra o
# servidor automaticamente quando a janela do programa for fechada.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

$port = 8080
$logFile = Join-Path $root 'data\portalguard-launcher.log'

# Log simples em arquivo: como a janela do launcher pode ficar oculta, o log
# garante um historico do inicio, da porta e de qualquer erro.
function Write-Log {
    param([string]$Message)
    try {
        $dir = Split-Path -Parent $logFile
        if (-not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
        }
        Add-Content -LiteralPath $logFile -Value ('{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message) -Encoding UTF8
    } catch {
        # O log nunca deve interromper o inicio do programa
    }
}

# Mostra o erro em caixa de dialogo, pois a janela do launcher pode estar oculta
# (evita deixar o script travado esperando um ENTER invisivel).
function Show-Erro {
    param([string]$Titulo, [string]$Mensagem)
    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
        [System.Windows.Forms.MessageBox]::Show($Mensagem, $Titulo, 'OK', 'Error') | Out-Null
    } catch {
        Write-Host $Mensagem -ForegroundColor Red
    }
}

Write-Log "Iniciando PortalGuard local (porta $port)."

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
    Write-Log 'Primeira execucao: compilando o frontend (npm run build).'
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Falha na compilacao do programa.' -ForegroundColor Red
        Write-Log 'ERRO: falha na compilacao do frontend (npm run build).'
        Show-Erro 'PortalGuard local' 'Falha na compilacao do programa. Veja o log em data\portalguard-launcher.log.'
        exit 1
    }
    Write-Log 'Build do frontend concluido.'
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
        Write-Log "ERRO: o servidor nao respondeu na porta $port (porta em uso?)."
        Show-Erro 'PortalGuard local' "O servidor nao respondeu. Verifique se a porta $port esta em uso. Veja o log em data\portalguard-launcher.log."
        exit 1
    }
    Write-Log "Servidor no ar em $url (PID $($nodeProc.Id))."
    Write-Host "Servidor no ar em $url" -ForegroundColor Green
} else {
    Write-Log "Servidor ja estava rodando em $url."
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
    # Sem Edge/Chrome: usa o navegador padrao. Como a janela pode estar oculta,
    # encerra pelo proprio processo do servidor em vez de esperar um ENTER invisivel.
    Write-Log 'Sem Chrome/Edge detectado: encerrando quando o servidor for finalizado.'
}

# 5. Encerra o servidor (somente se foi iniciado por este script)
if ($serverStartedByUs -and $nodeProc -and -not $nodeProc.HasExited) {
    Write-Host 'Encerrando o servidor...'
    Write-Log 'Janela do PortalGuard fechada: encerrando o servidor.'
    try { Stop-Process -Id $nodeProc.Id -Force } catch { }
    Start-Sleep -Milliseconds 500
}

Write-Host 'Programa encerrado. Pode fechar esta janela.' -ForegroundColor Yellow
Write-Log 'PortalGuard local encerrado.'
Start-Sleep -Seconds 2
