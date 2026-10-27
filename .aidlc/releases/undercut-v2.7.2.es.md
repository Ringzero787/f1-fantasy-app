# uc-v2.7.2 — 2026-10-27

Undercut 2.7.2: tres correcciones de Pick Team surgidas de los fichajes de México — el selector reserva el cierre más barato para que un piloto nunca te deje sin constructor, tus fichajes se guardan antes de completar la alineación, y el consejo de Pit Wall es una fila resaltada en lugar de una insignia sobre las cifras.

## Corregido

- **Un piloto que no dejaba sitio para un constructor.** Un piloto contaba como asequible si su precio cabía en el dinero restante, sin reservar nada para los asientos aún libres: cuatro pilotos de Pit Wall con $65 no dejaban ningún constructor que pudieras comprar, y Pit Wall marcaba justo al piloto que lo causaba. Ahora una fila solo es asequible si el cierre más barato de los asientos libres, constructor incluido mientras no haya uno elegido, sigue cabiendo después; la línea de presupuesto cuenta el constructor como asiento y la insignia LEAVES dice para qué es el dinero.
- **Fichajes que no se podían guardar.** SAVE LINEUP esperaba a cinco pilotos y un constructor, así que cuatro fichajes no podían conservarse sin un constructor que no podías pagar. Una alineación modificada se guarda ahora tal cual, el resumen nombra los asientos libres y que se rellenan solos al cierre, y salir con fichajes sin guardar (CANCEL, el botón atrás o el gesto de iOS) pregunta primero.
- **La insignia PIT WALL PICK sobre las cifras.** La insignia estaba junto al nombre del equipo y se metía bajo la columna de proyección. El consejo de Pit Wall es ahora toda la fila, resaltada, con la etiqueta en su propia línea sobre el nombre; BEST VALUE y las pistas de combinación van en una línea bajo el nombre del equipo.
