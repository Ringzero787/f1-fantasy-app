# uc-v2.8.0 — 2026-11-14

Undercut 2.8.0: Pit Wall planifica el resto de tu alineación a partir de tus primeras elecciones y propone tu as al confirmar, además de las correcciones de la última prueba: un piloto que puedes pagar nunca se bloquea, cualquier piloto del mercado abre sus detalles y los nombres de equipo van primero.

## Novedades

- **Estrategias de Pit Wall.** Los primeros pilotos que añades le dicen a Pit Wall cómo construyes: un piloto del tercio más caro se lee como STARS, solo pilotos económicos como VALUE y cualquier otra cosa como BALANCED. Una franja PIT WALL STRATEGY en la pestaña de pilotos te deja cambiar, y los pilotos de su plan para tus plazas libres llevan PIT WALL PLAN, dentro de tu saldo tras el constructor más barato.
- **El as al confirmar.** Guardar una alineación completa abre la propuesta de as de Pit Wall en cuanto vuelves a tu equipo.

## Cambios

- **Primero el nombre del equipo.** El nombre de tu equipo va en grande y el del jugador en pequeño debajo, en el Grid, en las ligas y en el informe de la ronda. El feed de Moonshot de la liga es una línea: MOONSHOT +N POINTS · TEAM.
- **Los números de coche** son más grandes, en negrita y con los colores del equipo en las fichas de equipo y de liga.
- **Pit Wall es dorado.** Su franja de elección, la propuesta de as, el análisis y las filas del Pass usan dorado en lugar de rojo; el rojo ahora indica un mal número y los avisos son naranjas.
- **Un equipo retenido dice cuándo se reabre.** Tras una carrera la cabecera muestra RESULTS PENDING, REOPENS IN … o REOPENING SOON en lugar de una cuenta atrás sobre filas bloqueadas, y tu equipo se vuelve a leer al regresar a él.

## Correcciones

- **Un piloto asequible que no podías comprar.** La 2.7.2 bloqueaba cualquier piloto que dejaba demasiado poco para el cierre más barato, así que con $18 no se compraba un piloto de $5. Ahora un piloto que puedes pagar siempre se puede comprar; el que deja demasiado poco se marca TIGHT · LEAVES TOO LITTLE FOR THE REST.
- **Detalles del mercado fuera del modo de edición.** Las filas bloqueadas o no disponibles abren una hoja de detalles de solo lectura, y una pulsación larga la abre en cualquier fila.
- **«JR» como apellido.** Los nombres con Jr., Sr. o un numeral muestran el apellido real.
