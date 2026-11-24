# uc-v2.9.0 — 2026-11-24

Undercut 2.9.0: detección dinámica de temporada, correcciones de puntuación y reglas de contrato justas

## Añadido

- Banner de aviso gestionado desde el servidor en el panel de Equipo para anuncios puntuales sin necesidad de actualizar la app
- Resaltado visual para huecos de alineación abiertos (acento suave, borde discontinuo, signo más con anillo)
- El autocompletado ahora reinicia el contador de penalización por plantilla desactualizada, igual que un traspaso manual
- Agregador de estadísticas para administradores con información diaria de uso
- Reintento automático para resultados de carrera retenidos con resolución de nombres de coche desconocidos
- Pruebas de extremo a extremo de corrección de carreras en el emulador de Firestore

## Cambios

- **Cambio importante:** la app ahora obtiene la temporada actual desde el servidor en lugar del año del dispositivo; es necesario recompilar para estar lista para 2027
- La duración del contrato ahora está limitada por las carreras restantes de la temporada y por periodos de seis carreras por piloto
- Las correcciones de resultados tras la carrera vuelven a calificar a todos los equipos afectados dentro de una ventana de 72 horas
- Las ventas por caducidad se ejecutan a precios posteriores a la carrera, no anteriores
- El cambio de temporada ahora archiva 2026, reinicia equipos y clasificaciones, y establece los precios y el calendario de 2027
- La venta del Pit Wall Pass se traslada a diciembre para la próxima temporada (disponible fuera de temporada)
- Las cuentas de prueba de la tienda quedan excluidas de las estadísticas de administrador

## Corregido

- Reembolso de penalizaciones por plantilla desactualizada para los equipos autocompletados de Las Vegas 2026
- Compatibilidad con iOS 15.1+ (soporte para Xcode 27, protección de expo-router para iOS 16)
- La corrección de carreras y la reparación por caducidad ahora escriben de forma atómica con set+mergeFields
- La reparación de ventas por caducidad evita que el presupuesto caiga por debajo de cero
- El cambio de temporada reinicia los equipos con la secuencia de precios correcta
- Revisión de seguridad de dependencias; se eliminó la exención general de GHSA

## Seguridad

- Reglas de lectura de Firestore exclusivas para administradores en las estadísticas agregadas
- Se solucionaron vulnerabilidades de dependencias
