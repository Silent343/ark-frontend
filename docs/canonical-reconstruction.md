# Reconstrucción canónica: primera integración

## Código conectado al producto

El estudio 3D utiliza una IR métrica común (`CanonicalFloorPlanGraph`, versión 1.0) derivada del Blueprint editable. CAD y raster convergen en el mismo adaptador. La IR usa XY horizontal y Z vertical; el adaptador invierte expresamente el Y descendente del editor y convierte las distancias a metros. El renderizador existente recibe de vuelta los muros desde la IR validada, conservando IDs y referencias. No se escribe una segunda copia de la geometría en la base de datos ni se migran proyectos destructivamente.

La derivación y la construcción topológica ocurren en un worker cancelable. No se duplican las imágenes ni los vértices originales CAD para esa operación. El grafo contiene semiaristas gemelas, sucesor/predecesor y caras, intersecciones T/X y división de solapamientos colineales. Los componentes interiores desconectados conservan sus huecos. El redondeo usa una rejilla métrica de 1 mm; no se cierran automáticamente brechas mayores ni se considera que cualquier cara sea una habitación arquitectónicamente confirmada.

La validación detecta IDs duplicados, dimensiones no finitas, niveles inexistentes, aberturas sin anfitrión, fuera del muro o superpuestas, contornos degenerados/autointersectados y huecos externos o superpuestos. Rechaza confianza probabilística sin identificador de calibración. Los valores heredados supuestos se etiquetan `inferred_fallback`, y los desconocidos quedan `null`; no se convierte una puntuación heurística en probabilidad.

En el modelo, la preparación sigue estados explícitos: sin fuente, pendiente de unidades, pendiente de plantas, listo, validando, reconstruido, requiere revisión y fallo de ejecución. Cuando faltan requisitos o existen conflictos bloqueantes, se muestra el diagnóstico y un visor 2D, en lugar de montar un WebGL vacío. La cobertura de clasificación cuenta entidades geométricas extraídas de las plantas seleccionadas; no equivale a precisión, y las entidades que el parser omitió se declaran separadamente. Las entidades sin categoría se resaltan en naranja.

## Raster de alta resolución

Las imágenes conservan su resolución nativa y los PDF se analizan a 200 DPI. La miniatura de 1400 píxeles sirve exclusivamente para mostrar/guardar una previsualización, sin cambiar coordenadas ni escala de análisis. El vectorizador procesa ventanas de 1024 píxeles con al menos 20 % de solapamiento en un worker, recompone coordenadas globales y fusiona segmentos colineales observados en ambas ventanas. No fusiona líneas separadas por un vano ni limita el resultado a 400 muros.

El procesamiento mantiene presupuestos explícitos: 32 megapíxeles/16384 píxeles por lado para el canvas actual y límites de comparaciones para evitar bloquear el navegador. Excederlos produce un error con instrucciones para delimitar la fuente; nunca una reducción silenciosa ni un resultado presentado como completo. La carga PDF todavía rasteriza una página completa dentro de ese presupuesto: la rasterización PDF por región y ejecución reanudable en servidor quedan pendientes.

Los contornos cerrados del grafo producen propuestas de superficies con sus huecos. Solo las caras rectangulares se adaptan al editor antiguo de habitaciones; las irregulares conservan su polígono como superficie. La detección por color es complementaria y usa una miniatura: no determina los muros. Los espesores de superficie siguen siendo propuestas heredadas para revisión.

## Evidencia geométrica CAD

Las capas desconocidas ya no requieren nombres numéricos para examinar su geometría. Se añaden propuestas por caras paralelas conectadas y arcos de abatimiento de 45/90 grados con hoja y apoyo estructural. Las asignaciones revisadas por el usuario prevalecen. Los nombres de capas/bloques continúan como señales de compatibilidad; esta fase no elimina todas las reglas anteriores ni constituye un clasificador aprendido de todas las categorías.

## Capacidades pendientes

- El detector neuronal existente conserva sus cuatro clases y su análisis CAD actual. El tiling de esta fase corresponde al vectorizador raster; todavía no se ha integrado inferencia neuronal multiventana, NMS poligonal de instancias ni reconstrucción neuronal completa de aberturas.
- Hay contratos para curvas, estructura, redes MEP, mobiliario y terreno; el adaptador/renderizador de compatibilidad mantiene las capacidades geométricas existentes. No crea vigas, cimentaciones, cubiertas inclinadas ni familias completas a partir de información ausente.
- No se ha implementado todavía registro multivista por grillas, lectura de cuadros orientados, cierre de brechas condicionado por semántica, entrenamiento propio ni exportación IFC.
- El protocolo de evaluación independiente sigue vigente. Las pruebas nuevas comprueban invariantes del software y equivalencia de geometría calibrada, no reconocimiento equivalente de fuentes con información diferente ni exactitud arquitectónica real.

## Verificación

`npm run test:canonical` comprueba DCEL, T/X, contornos abiertos, huecos anidados, solapamientos, geometría degenerada, conversión métrica entre formatos, conservación de IDs, aberturas inválidas, confianza no calibrada, estados de preparación, costuras de ventanas, conservación de más de 400 muros y respeto de mappings CAD revisados. Se mantienen las pruebas de raster, CAD, evidencias, correspondencia y máscaras neuronales anteriores.

`npm run test:canonical:browser` comprueba los workers reales, estados, resaltado, disposición móvil, exportación IR y carga/importación de un PDF sintético de 2778 píxeles de ancho. Usa un contexto nuevo e intercepta todas las rutas API; no escribe en proyectos reales. `ARK_TEST_URL` permite indicar un servidor local de pruebas. Las capturas y exportaciones de QA quedan en `.data/qa/canonical-browser`, ignorado por Git.
