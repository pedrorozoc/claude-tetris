<#
.SYNOPSIS
    Consulta el clima desde wttr.in (sin API key).

.EXAMPLE
    pwsh -File get-weather.ps1
    Clima local (ubicación deducida por IP).

.EXAMPLE
    pwsh -File get-weather.ps1 -Ubicacion "Madrid" -Formato pronostico
#>
[CmdletBinding()]
param(
    [string]$Ubicacion = "",

    [ValidateSet("corto", "completo", "pronostico", "json")]
    [string]$Formato = "completo"
)

$ErrorActionPreference = "Stop"

# wttr.in entrega texto plano solo si el User-Agent parece curl/wget.
$headers = @{ "User-Agent" = "curl/8.0" }

$loc = if ([string]::IsNullOrWhiteSpace($Ubicacion)) {
    ""
} else {
    [uri]::EscapeDataString($Ubicacion.Trim())
}

switch ($Formato) {
    "corto"      { $query = "format=3&lang=es&m" }
    "completo"   { $query = "0&Q&lang=es&m" }
    "pronostico" { $query = "2&Q&lang=es&m" }
    "json"       { $query = "format=j1&lang=es" }
}

$url = "https://wttr.in/$loc`?$query"

try {
    $resp = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 20
    $texto = if ($resp.Content -is [byte[]]) {
        [System.Text.Encoding]::UTF8.GetString($resp.Content)
    } else {
        $resp.Content
    }
    Write-Output $texto.TrimEnd()
}
catch {
    Write-Error "No se pudo obtener el clima desde wttr.in ($url): $($_.Exception.Message)"
    exit 1
}
