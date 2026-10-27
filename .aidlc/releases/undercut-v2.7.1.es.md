# uc-v2.7.1 — 2026-10-27

Undercut 2.7.1: corrige el cierre inesperado al abrir en 2.7.0, hace que el resumen del fin de semana cuente tu fin de semana tal como se puntuó, un resumen por equipo, y mantiene Moonshot activo tras iniciar sesión.

## Corregido

- **Cierre inesperado al abrir en 2.7.0.** 2.7.0 se compiló sin su configuración web de Firebase y se detenía en la pantalla de inicio en todas las plataformas. 2.7.1 son las mismas funciones compiladas correctamente, y los scripts de compilación ahora rechazan un paquete sin esa configuración.
- **Moonshot desactivado tras iniciar sesión.** La app leía su configuración una vez al arrancar, a veces antes de restaurar la sesión, y conservaba los valores por defecto toda la sesión: el contador de Moonshots, la tarjeta de Moonshot del resumen y la línea de la próxima ronda quedaban ocultos hasta un arranque en frío. Ahora la configuración se vuelve a leer en cuanto se conoce el inicio de sesión.

## Cambios

- **Resumen del fin de semana desde el registro.** El resumen muestra ahora tus puntos tal como los puntuó el servidor, pieza a pieza, con ACE ×2, TEAM y AUTO marcados y los fichajes con 0 puntos en una sola línea; FIELDED n OF 6 cuando quedaron huecos; tu puesto en la ronda con la distancia al ganador y tu puesto de temporada con su movimiento; tu Moonshot resuelto con el total del fin de semana; y la próxima ronda con su bloqueo y tu Moonshot en ella. La tarjeta nombra al equipo, y quien tiene dos equipos recibe un resumen por equipo.
