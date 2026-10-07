# uc-v2.5.0 — 2026-10-07

Predicciones de Moonshot, edición del nombre de equipo y mejoras en el cronometraje en vivo en Undercut 2.5.0.

## Novedades

- **Moonshot**: desde la ronda 13, un equipo rezagado en su liga puede hacer un call sobre un piloto para la próxima carrera —victoria, podio, puntos o superar a un rival— arriesgando parte de sus puntos de temporada o del presupuesto de plantilla. Un acierto suma la recompensa al total de temporada; un fallo cuesta lo arriesgado. Disponible en las vistas de equipo y liga, con guía en el primer uso.
- Ingesta de datos de cronometraje en vivo el día de la carrera, distribuida en Firestore para actualizaciones en tiempo real.
- Posibilidad de renombrar tu equipo y el nombre de manager desde el portal Pit Wall; los cambios se sincronizan en todos tus dispositivos.
- Tipografía Archivo en la app, a juego con el portal web Pit Wall.

## Cambios

- La sincronización de los metadatos del equipo ahora es más inteligente: solo los cambios locales de tu dispositivo se suben a Firestore, evitando que se reviertan ediciones hechas en otro lugar.
- El cierre de alineación que se muestra en la app ahora coincide con la hora de cierre aplicada por el servidor.

## Solucionado

- Se aplicaron mejoras de seguridad antes del lanzamiento de la versión 2.5.0.
- La creación de ligas ya no otorga funciones de pago sin la licencia correspondiente.
- Los ID de liga del equipo ahora se validan como ID de documento de Firestore utilizables.
- La sincronización de metadatos ya no sobrescribe copias del servidor más recientes durante las actualizaciones periódicas.
