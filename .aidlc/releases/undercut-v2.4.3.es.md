# uc-v2.4.3 — 2026-10-04

Undercut 2.4.3: Cuentas unificadas, seguridad en las compras y funciones premium de Pit Wall.

## Novedades

- Inicio de sesión multiplataforma: tu cuenta funciona sin importar si instalaste desde Google Play, App Store o Amazon Appstore
- Comparte la clasificación de tu liga y tu equipo directamente desde la app
- Los derechos del Pit Wall Pass ahora se revocan cuando la tienda reembolsa tu compra
- Detalle del piloto en la app que muestra qué incluyó tu pase
- Rediseño del Pit Wall Briefing con sección principal, resumen de llamadas y movimientos de precio

## Cambios

- El bloqueo de Ace ahora usa el calendario del servidor en lugar del incluido en la app
- Las proyecciones de Pit Wall incluyen piso, mediana, techo, riesgo de abandono y estimaciones del próximo precio
- El Pit Wall Pass ($14.99/temporada) es el único producto premium; League Pro se deriva de la posesión del pase

## Solucionado

- **Seguridad**: los tokens manipulados de Play Store ya no pueden comprar paquetes ni pases a precios incorrectos
- **Seguridad**: se eliminó el respaldo de clave de API de producción; ya no hay degradación silenciosa ante errores de configuración
- La ventana de Ace ahora se congela en cada sesión en la que puntúa, no solo en las carreras
- La transferencia de inicio de sesión queda bloqueada al dispositivo que la inició
- Las compras ahora se otorgan una sola vez por transacción, no una vez por cada apertura de la app
- Las concesiones de pase funcionan correctamente después de las revocaciones
- Las compras pendientes en la cola de la tienda ahora se completan correctamente
- Se corrigió el mapeo de rondas; Baréin quedó reinstaurado en Sepang como R18
- Nueve scripts operativos ya no fallan de forma silenciosa al importarse
- El campo SHARE del equipo se lee como control, no como leyenda
- Se detuvo la importación de seeder; el calendario ahora es correcto
- La compilación de iOS ya no ofrece la opción de Amazon Appstore

## Seguridad

- El bloqueo de Ace se trasladó al servidor; se eliminó la implementación exclusiva de la app
- Los secretos compartidos de Amazon y Apple se migraron a Secret Manager
- Los ID de recibo de Amazon usan su propio formato, distinto al de Play Store
- Se resolvieron los avisos de dependencias de alta gravedad
- Todas las protecciones en tiempo de importación y las clases de escape ahora están cerradas
