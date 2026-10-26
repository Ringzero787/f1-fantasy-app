# uc-v2.7.0 — 2026-10-26

Undercut 2.7.0: el mercado sigue abierto mientras tu alineación está bloqueada, tu Moonshot aparece en el resumen del fin de semana, el contador de Moonshots cuenta al bloquearse, y el consejo de as de Pit Wall encabeza la ficha del piloto. En el servidor, los resultados ya llegan a tiempo porque el feed de tiempos se lee con la clave de pago (eso no necesita compilación).

## Novedades

- **Mercado durante el bloqueo.** MARKET en la fila del equipo abre el selector como un mercado de solo lectura durante todo el fin de semana de carrera: precios, puntos y proyecciones, nada que tocar. La barra de guardado dice LOCKED · AUTO-FILL ON.
- **Moonshot en el resumen del fin de semana.** Una tarjeta entre los puntos del fin de semana y los anotadores muestra tu apuesta, la posición final del piloto y los puntos, y una línea suma plantilla y Moonshot en el total del fin de semana. Una apuesta en efectivo se nombra como efectivo; una anulada dice que el token volvió.
- **Puntuación en vivo el día de carrera, desactivada.** El código para un LIVE +N en cada ficha y una estadística LIVE · SO FAR durante la carrera está en esta versión, pero no se muestra nada hasta que el interruptor de tiempos en vivo se active tras la confirmación escrita del proveedor de tiempos.

## Cambios

- **Contador de Moonshots.** Un token cuenta como usado cuando su apuesta se bloquea, no cuando la haces, porque una apuesta abierta todavía puede cancelarse con reembolso completo: ONE IN PLAY · COUNTS WHEN SELECTIONS LOCK, luego ONE USED THIS WEEKEND.
- **El consejo de as primero.** El ACE CALL de Pit Wall es el primer bloque de la ficha del piloto, bajo su nombre y equipo; cuando el consejo es hacer as a ese piloto, MAKE ACE · 2× POINTS está justo ahí y el botón inferior desaparece.
