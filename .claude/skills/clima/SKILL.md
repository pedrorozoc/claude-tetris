---
name: clima
description: >-
  Consulta el clima actual y el pronóstico usando wttr.in (sin API key, sin
  registro). Úsala cuando el usuario pida "el clima", "qué tiempo hace", "cómo
  está el clima", "pronóstico", "temperatura", "va a llover", o invoque /clima.
  Sin ubicación explícita usa geolocalización por IP (clima local).
---

# Clima

Obtiene información meteorológica desde [wttr.in](https://wttr.in), que no
requiere clave de API ni conexión a servicios de pago. Todo sale por línea de
comandos y funciona con la conexión a internet local de la máquina.

## Cómo usarla

Ejecuta el script de PowerShell incluido en esta skill:

```powershell
pwsh -File .claude/skills/clima/scripts/get-weather.ps1 [-Ubicacion "<ciudad>"] [-Formato corto|completo|pronostico|json]
```

Parámetros:

- `-Ubicacion` (opcional): ciudad, aeropuerto (`MAD`), código postal o
  `"lat,lon"`. Si se omite, wttr.in deduce la ubicación por la IP pública →
  **clima local**.
- `-Formato` (opcional, por defecto `completo`):
  - `corto` — una sola línea: `Ciudad: 🌦️ +16°C`.
  - `completo` — condición actual con arte ASCII (sin cabecera ni pronóstico).
  - `pronostico` — hoy + los próximos 2 días.
  - `json` — respuesta cruda `j1` de wttr.in para procesar datos concretos
    (humedad, viento, UV, salida/puesta de sol, etc.).

La salida ya viene en español (`lang=es`) y en sistema métrico.

## Flujo esperado

1. Si el usuario nombra una ciudad, pásala en `-Ubicacion`; si no, no pases nada
   (clima local por IP).
2. Elige el `-Formato` según lo que pida: un dato rápido → `corto`; "cómo está el
   clima" → `completo`; "esta semana" / "mañana" → `pronostico`; un valor
   puntual (¿qué humedad hay?) → `json` y extrae el campo.
3. Ejecuta el script y **resume el resultado en español** en una o dos frases;
   incluye el arte ASCII solo si el usuario quiere ver la salida completa.
4. Si el script falla (sin internet, wttr.in caído, ubicación no encontrada),
   dilo claramente y no inventes datos.

## Notas

- wttr.in aplica rate limiting; evita llamadas repetidas en bucle.
- Alternativa manual equivalente: `curl -s -A curl "https://wttr.in/Madrid?0&Q&lang=es"`.
- Para incrustar en otro sitio: `format=3` (línea) o `format=j1` (JSON).
