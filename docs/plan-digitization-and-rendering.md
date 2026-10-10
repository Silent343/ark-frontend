# Digitalización y visualización de planos

## Flujo implementado

En el editor 2D, **Importar y calibrar plano** abre un asistente. Puede elegir un archivo del equipo o un documento ya guardado en el proyecto. Crear un proyecto con un archivo abre este asistente; crear uno sin archivo deja la geometría vacía, sin copiar un proyecto de demostración.

1. PDF.js rasteriza la página seleccionada de un PDF. PNG, JPEG y WebP también se admiten. Límite de entrada: 12 MB; resolución de análisis: hasta 1400 px por lado.
2. El usuario ajusta giro, inclinación, contraste y reducción de ruido. La corrección de perspectiva utiliza cuatro esquinas ordenadas, con transformación proyectiva. El archivo original no se modifica.
3. Dos puntos y una distancia conocida establecen `metersPerUnit`. Las coordenadas se pueden introducir con teclado. No se deduce una escala métrica de un número OCR sin confirmación humana.
4. Un detector **heurístico, no un modelo de IA entrenado**, extrae trazos oscuros largos horizontales/verticales y diagonales de 45°, descarta trazos finos y grandes bloques y aproxima uniones cercanas.
5. Un relleno de regiones propone solamente recintos rectangulares cerrados. No se rellenan huecos del tamaño de una puerta para inventar habitaciones.
6. Se conservan los textos embebidos del PDF mientras sus coordenadas sigan alineadas. Opcionalmente Tesseract.js ejecuta OCR en español, inglés o portugués con modelos alojados en la propia aplicación. Los textos contenidos en un recinto pueden proponer su nombre.
7. El usuario revisa la superposición antes de importar. Los rótulos OCR legibles cercanos a un muro pueden proponer puertas o ventanas; los rótulos de escalera pueden proponer una escalera recta o de caracol. Ninguna se importa sin marcar expresamente su casilla. El resultado siempre se guarda como **borrador**. Los muros pendientes se muestran en ámbar y cada elemento se marca como revisado desde el inspector. El panel muestra el avance por hoja y permite ver solo sus pendientes. Modificar geometría aceptada invalida su revisión. La confianza OCR y el porcentaje de revisión son conceptos distintos; no hay porcentajes de detección prefijados.
8. El visor 3D usa la escala calibrada y las alturas confirmadas por el usuario. Permite vista provisional de borradores, claramente señalada. La revisión geométrica no es una validación estructural ni normativa.

La importación conserva cada página como una hoja con disciplina, nivel, origen y escala propios. Se pueden agregar hasta 24 hojas de arquitectura, estructura, electricidad y agua/desagüe; el usuario selecciona el nivel de cada una, incluidos sótanos. Por defecto, importar otra hoja arquitectónica **suma** su geometría al modelo. Para actualizar una hoja se elige exactamente esa fuente y se confirma la sustitución: conserva su ID y retira solo sus elementos, conexiones dependientes y aprobaciones anteriores. Las demás hojas y los elementos manuales permanecen. La posición en X/Y alinea distintas fotos de una planta o dos construcciones en una imagen. La detección de recintos puede proponer más de un espacio rectangular cerrado en una misma hoja. No infiere cuántos pisos hay solo por la imagen.

Las hojas de instalaciones no se convierten en muros. El texto PDF/OCR que indique con suficiente claridad un tomacorriente, interruptor, luminaria, tablero, punto de agua o desagüe puede proponer un punto de servicio, que exige confirmación en la importación. Los símbolos sin texto legible deben marcarse manualmente en el editor 2D. Se pueden enlazar puntos del mismo sistema y nivel; el 2D y el 3D muestran esas conexiones como esquemas directos, sin inferir el recorrido real de tubos, conductores o bajantes. Tanto estos puntos como su nivel se conservan en el 3D con marcadores y etiquetas. Un plano eléctrico o sanitario no constituye un cálculo ni una verificación normativa de la instalación.

La cubierta tampoco se deduce del perímetro del plano: el editor define zonas parciales de cubierta por nivel, con posición, dimensiones, espesor y elevación. El visor 3D representa únicamente esas zonas; si no se define ninguna, el modelo queda sin cubierta. La topología y las referencias de nivel se validan antes de guardar y los cambios invalidan la revisión previa.

## Render y ambientación

- Conversión métrica común para muros, aberturas, habitaciones y columnas. Los planos antiguos conservan temporalmente su factor 1/86 y muestran que necesitan calibración.
- Cámara y planos de recorte adaptados al tamaño del edificio y del lote. El terreno no se reduce artificialmente para ajustarlo a la cámara.
- Alturas de muros, alturas de aberturas y antepechos editables en metros. Las aberturas se proyectan al muro asociado y los casos fuera de límites o superpuestos se señalan para revisión.
- Materiales físicos procedurales, iluminación de hemisferio, reflejos de estudio locales, sombras dimensionadas al modelo y tone mapping ACES.
- Exposición, dirección de luz, elevación solar artística y activación de sombras. Los ajustes se conservan por proyecto en el navegador.
- Calidad baja: menor resolución y sin sombras/reflejos de estudio. Media y alta activan presupuestos de render diferentes según Preferencias.

Estas ambientaciones no calculan el sol real para una ubicación, fecha y hora. El lote es una representación plana, no un levantamiento topográfico. La estructura portante sigue siendo esquemática y los movimientos sísmicos son educativos.

## Límites explícitos de esta entrega

- No hay un detector entrenado que clasifique símbolos gráficos de puertas, ventanas, columnas o escaleras. Las propuestas basadas en rótulos OCR son pistas, no detección fiable de símbolos. El editor permite corregir geometría; la clasificación avanzada requiere un modelo y un conjunto de evaluación específicos.
- La heurística diagonal cubre 45°; no reconoce de forma fiable ángulos arbitrarios, curvas, habitaciones poligonales ni ensambla páginas automáticamente. La asociación de hojas a niveles, la alineación y la confirmación de símbolos continúan siendo pasos humanos.
- La lectura OCR puede equivocarse. Cotas, alturas y escala requieren confirmación. La altura inicial de muro es una suposición editable, no un dato detectado.
- La revisión actual es un estado de trabajo compartido, no una firma técnica ni una certificación. El historial duradero de revisiones geométricas completas, la exportación BIM/IFC y texturas PBR fotográficas quedan para una fase posterior.
- No se han conectado APIs de pago ni enviado planos a servicios de IA. La primera instalación descarga dependencias y pesos; durante el análisis se sirven desde `public/vendor/plan-tools`.

## Contrato y persistencia

Se mantiene la frontera REST existente, sin introducir endpoints de acción como `convertTo3D`:

- `GET /api/v1/projects/{projectId}/blueprints`
- `POST /api/v1/projects/{projectId}/blueprints` para el primer plano
- `PATCH /api/v1/projects/{projectId}/blueprints/{blueprintId}` con `If-Match` para cambios

La fila PostgreSQL `teluria.blueprints` conserva el agregado `geometry` en JSONB. `calibration`, `sourceSize`, `review`, `sheets`, `roofs` y `services` amplían ese JSON con la nomenclatura camelCase ya usada por `Blueprint`; las columnas relacionales de los recursos REST continúan en snake_case. La migración inicial del backend crea esta tabla sin modificar el SQLite anterior.

La API valida referencias, coordenadas finitas, coherencia entre distancia y escala, límites de metadatos OCR y el estado de revisión. Permisos de proyecto y control de concurrencia se mantienen. `sourceSize` evita que ampliar el lienzo estire la imagen y rompa la calibración.

## Estrategia recomendada de IA

Mantener tres capas independientes: **reconocimiento que propone**, **geometría determinista que valida** y **render que presenta**. Una imagen atractiva generada por IA nunca debe reemplazar el `Blueprint` editable.

| Necesidad | Opción | Uso recomendado |
| --- | --- | --- |
| OCR inmediato en el navegador | Tesseract.js, ya integrado | Bajo coste de operación y sin envío de imágenes a terceros. Medir aciertos en los planos reales. |
| OCR especializado en un servicio propio | PaddleOCR / PP-OCRv5 | Evaluar frente a Tesseract con textos pequeños, escaneos y los idiomas del estudio; no sustituye la calibración. |
| Muros y símbolos arquitectónicos | Mask R-CNN ajustado con planos etiquetados | Candidato a evaluar, no modelo listo para arquitectura. Entrenar clases/máscaras, versionar pesos y medir errores por elemento. |
| Corrección asistida de máscaras | SAM 2 | Selecciones por puntos o cajas guiadas por el usuario o por un detector; no conoce por sí solo la semántica arquitectónica ni las medidas. |
| Imágenes de presentación | SDXL con ControlNet de bordes/profundidad | Variantes de acabados y atmósfera a partir de una captura del 3D. Etiquetar como ilustración y revisar alteraciones geométricas. |

Fuentes primarias: [Tesseract.js](https://github.com/naptha/tesseract.js), [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [ajuste de Mask R-CNN en TorchVision](https://docs.pytorch.org/tutorials/intermediate/torchvision_tutorial.html), [SAM 2](https://ai.meta.com/research/sam2/), [SDXL con ControlNet](https://huggingface.co/docs/diffusers/main/en/api/pipelines/controlnet_sdxl).

CubiCasa5K es una referencia útil para investigar detección de planos, pero su licencia publicada es **CC BY-NC 4.0**. No debe incorporarse sin revisar los derechos necesarios para un producto comercial. Consultar la [licencia del repositorio](https://github.com/CubiCasa/CubiCasa5k/blob/master/LICENSE), además de los permisos de datos y pesos de cualquier alternativa.

Antes de desplegar un detector avanzado: reunir planos con permiso, separar entrenamiento/prueba por edificio, medir error de escala, precisión de cada clase, cierre de recintos, asociación de aberturas y tiempo de corrección humana. Comparar el modelo con la base heurística; no escogerlo solo por una captura bonita. Un servicio futuro de inferencia debería usar trabajos REST, cuotas, cancelación, aislamiento por proyecto y consentimiento explícito para proveedores externos.

## Comprobación local

### CAD editable y reconstrucción por capas

El flujo DWG/DXF conserva en `Blueprint.cad` las entidades editables, las capas y las regiones de planta. El editor de pantalla completa permite seleccionar, desplazar, girar, escalar, modificar vértices y editar textos. La vista previa no expone herramientas de edición. La navegación del espacio usa una única fila con menús contextuales por área.

La compilación semántica interpreta capas identificables como muros, puertas, ventanas, columnas, escaleras, mobiliario y servicios. Las regiones evitan extruir elevaciones y cortes como plantas del edificio. Los títulos sugieren sótanos y plantas repetidas; el usuario puede corregir región, nombre, cota, repetición, unidades y función de cada capa. La confirmación de unidad es independiente de la detección de plantas. Las cotas NPT se leen durante la detección; las cotas editadas por el usuario prevalecen. Sin cota explícita se conserva la altura de proyecto como hipótesis.

La reconstrucción v2 empareja caras paralelas para medir espesores, une segmentos redundantes y registra plantas por geometría compartida. Las capas estructurales distinguen columnas compactas, muros largos y ejes. Las aberturas requieren soporte de jambas/muros; los tramos de escalera siguen sus peldaños y orientación. Una máscara métrica recupera contornos de losas con huecos explícitos para patios, ductos y escaleras. El mobiliario se conserva como trazado preciso al aislar una planta, sin cajas volumétricas inventadas. Las cubiertas solo se generan desde contornos cerrados asignados a esa función.

Sigue siendo **un borrador, no BIM final**. La inscripción en la lámina puede ser incompleta o ambigua. Las alturas de puertas/ventanas, antepechos sin anotación y acabados son valores iniciales; revisar unidades, registro, vacíos y geometría antes de medir. No se deducen armaduras ni vigas ausentes. Los símbolos de instalaciones son referencias pendientes de clasificación; no una red MEP calculada. Las capas desconocidas permanecen editables como referencia.

El editor reconstruye en un Web Worker cancelable; una edición posterior invalida resultados antiguos. El visor v2 agrupa muros, marcos, columnas y peldaños con `InstancedMesh`, fusiona superficies por nivel, limita la resolución del dispositivo y renderiza bajo demanda. Las sombras se recalculan cuando cambia la geometría o la luz, no por cada movimiento de órbita. Recorrido y simulación mantienen animación continua cuando la necesitan. Las vistas antiguas se actualizan fuera del hilo de interfaz sin sobrescribir automáticamente su CAD.

PNG/JPG usan el mismo render vectorial a resolución de exportación. El DWG generado contiene las entidades editadas; los bloques y cotas se descomponen, las curvas se aproximan y objetos especiales no compatibles (enumerados en el inspector) no se conservan. El original del usuario no se modifica. No debe presentarse como una conservación íntegra del DWG de origen.

El agregado se guarda por los endpoints REST de `blueprints`, con validación CAD y control `If-Match`. Únicamente este recurso admite cuerpos de hasta 32 MB para el JSON vectorial; el resto de los recursos mantiene su límite anterior. Para archivos mayores conviene almacenamiento de objetos y versiones de documento, no elevar indiscriminadamente el límite global.

`npm run test:cad` verifica regiones, unidades, repetición, edición inmutable, espesores medidos, patios abiertos, NPT, alineación entre plantas y ausencia de coordenadas no finitas. El backend valida contornos, niveles, número de peldaños y límites de coordenadas antes de persistir. La prueba local con EDIFICIO 4 abrió 83.567 entidades, guardó y recuperó un texto editado, descargó PNG/JPG/DWG y reabrió el DWG para comprobar ese texto. La reconstrucción v2 alinea seis regiones para nueve niveles y reconoce 85 ambientes etiquetados, pendientes de revisión técnica.

```powershell
npm run prepare:plans
npm run test:plans
npm run lint
npm run build
$env:TELURIA_API_URL='http://127.0.0.1:8000'
npm run start -- --hostname 127.0.0.1 --port 3010
```

Para `test:plans:browser`, inicia además una instancia aislada del backend en modo `TELURIA_TEST_MODE=1`, conectada a una base PostgreSQL de QA, y configura su origen permitido como `http://127.0.0.1:3010`. En otra terminal, la prueba utiliza Chrome en modo headless y un PDF sintético; exige `X-Ark-Test-Mode: 1` del backend antes de crear datos. Las capturas quedan en `.data/qa/plan-screenshots`. Los modelos y archivos de prueba no se versionan. `npm run dev` y `npm run build` preparan automáticamente los assets locales de PDF/OCR.
