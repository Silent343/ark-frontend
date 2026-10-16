# Detección neuronal de imágenes — primera integración

PNG, JPG y páginas PDF rasterizadas pasan ahora por el mismo API neuronal utilizado por CAD. La acción explícita «Detectar elementos con IA» no requiere conocer la escala. El modelo devuelve máscaras semánticas reales, puntuaciones de red sin calibrar y metadatos del artefacto. Un worker convierte esas máscaras a ejes y componentes de símbolos; esos componentes todavía no son una segmentación por instancias aprendida.

La máscara cuadrada y el letterboxing se transforman de vuelta a los píxeles del documento. El usuario puede alternar entre el original y la superposición. Al indicar una medida conocida, la app convierte las detecciones a las unidades compartidas del plano y las guarda como propuestas, sin marcarlas revisadas.

Las aberturas necesitan un muro anfitrión. Los segmentos solo se unen a través de un vacío cuando existe evidencia de una abertura aprendida; el vano se conserva al renderizar. Los objetos reconocidos de categorías compatibles usan las familias 3D existentes. Los símbolos no representables permanecen en la evidencia de la hoja. Las alturas iniciales son estimaciones, no mediciones de la imagen. El dibujo y las detecciones persisten por hoja, de modo que actualizar una hoja no borra los objetos de otras.

## Prueba local con la vivienda

El proyecto de prueba conserva la salida de CubiCasa experimental y la muestra junto al 3D. En esta imagen el modelo produjo regiones de puertas, ventanas y barandas, pero ningún sanitario o mueble. La integración no cambia esa ausencia en una detección positiva. La siguiente etapa es entrenar y evaluar clases propias con anotaciones independientes.

Los recuentos de ejes son segmentos vectorizados, no un número de muros físicos ni una medida de exactitud. No se deducen pisos, cubiertas, materiales ni instalaciones ocultas a partir de la apariencia.

## Espacios y refinamiento de muros — 14 de octubre

La API conserva ahora la cabeza de 12 categorías de espacios, independiente de la cabeza de símbolos. El orden de canales se verificó en el [código original de CubiCasa](https://github.com/CubiCasa/CubiCasa5k/blob/master/floortrans/plotting.py#L593). No se convirtió cocina en un mueble ni exterior en una planta decorativa.

La lectura de imágenes puede efectuar una segunda inferencia enfocada en el conjunto de zonas aprendidas, con margen y un máximo de dos pasadas. CAD mantiene la lectura anterior por defecto. La región y el letterboxing se transforman a coordenadas de la hoja completa, también en la superposición; no se modifica el archivo original. Esto mejora el muestreo disponible, no demuestra mejor exactitud sin referencia independiente.

El worker frontend ajusta los ejes con los trazos oscuros de la imagen original, limitados al soporte neuronal de arquitectura. Descarta trazos finos y ramas cortas, fusiona observaciones colineales solo con soporte continuo y ajusta encuentros soportados. Conserva diagonales y huecos. El umbral de contraste y el tamaño mínimo siguen siendo heurísticas: planos de colores claros o muy baja resolución requieren evaluación adicional.

Los espacios usan contornos cóncavos y exclusiones interiores, no envolventes convexas ni rectángulos. Muros y símbolos de aberturas actúan como barreras para sus componentes. El editor conserva sus polígonos al importar, mover y redimensionar, y el 3D dibuja acabados por esos contornos. No son losas estructurales ni cubiertas. La correspondencia de sus límites con los muros sigue pendiente de revisión. «Espacio sin clasificar» se muestra como tal.

Las exclusiones de la máscara representan incertidumbre de segmentación, no evidencia de un hueco estructural. Los contornos que se cruzan o tienen exclusiones ambiguas quedan fuera de la geometría renderizable, con un aviso y su evidencia en la imagen; no se rellenan automáticamente. El adaptador canónico también protege modelos anteriores que contengan esos contornos para que no bloqueen la visualización de los elementos válidos.

CubiCasa no tiene clases de silla, mesa, sofá, cama, planta o escalera. Desde el 16-10-2026 existe un detector de objetos separado, `ark-objects-pilot-v1`, ajustado con etiquetas provisionales preparadas sobre fuentes del usuario. Reconoce esas seis categorías y conserva la procedencia del entrenamiento en su manifiesto. No tiene evaluación arquitectónica independiente. Las detecciones sobre la vivienda incluida en su entrenamiento no son métricas de generalización.

## Entrenamiento propio

El backend incluye `scripts/prepare-plan-training.mjs`, `training/train_mask2former.py` y la guía `training/README.md`. El paquete privado de Larco conserva un inventario de 30 fuentes y siete recortes PNG con plantillas; no contiene máscaras humanas aprobadas. La preparación excluye propuestas y recortes parcialmente anotados de entrenamiento. Los grupos de edificio no pueden aparecer simultáneamente en entrenamiento y validación.

El flujo de máscaras con revisión independiente usa Mask2Former Swin-Tiny y sigue pendiente de anotaciones. El piloto de objetos usa YOLOv8n y sí exporta ONNX para el backend Node. Incluye recortes de imagen y tres prototipos CAD, no el etiquetado exhaustivo del corpus. Sus pesos experimentales heredan condiciones del preentrenamiento; no son una solución licenciada automáticamente para producción comercial. La guía reproducible está en `teluria-backend/training/README.md`.

## Verificación

- Compilación TypeScript/Next y lint de los archivos nuevos y modificados del flujo neuronal.
- Pruebas de letterboxing, rechazo de escala desconocida para 3D, límites de evidencia, anfitriones de aberturas y sustitución de objetos por hoja.
- Pruebas del grafo canónico y de preservación de vacíos durante la fusión raster.
- Pruebas del backend y dos pruebas del validador de entrenamiento.
- Regresiones de contornos cóncavos, huecos, transformaciones de edición, enfoque con coordenadas originales y grosor de muro respaldado por la imagen.
- Inferencia real, guardado desde la interfaz y visualización 3D con la evidencia superpuesta.

La suite previa `test:neural` tiene una discrepancia en `test-neural-expansion.mjs:202`: espera cero objetos CAD antes de aprobación, mientras los cambios locales previos de `NeuralVectorization.finish()` los incluyen automáticamente. Esa política CAD queda pendiente; el flujo nuevo de imágenes conserva el estado de propuesta sin certificar revisión.
# Ampliación y correcciones del 16-10-2026

El entrenamiento de mobiliario ampliado quedó como candidato, no como sustituto automático: mejoró en un recorte reservado con escala de planta, pero falló en el recorte ampliado. La UI muestra ambos límites sin presentar las métricas del conjunto de ajuste como exactitud. Las anotaciones siguen siendo provisionales y las fuentes privadas permanecen fuera de Git.

La lectura raster pide hasta cuatro recortes arquitectónicos de detalle, ejecutados secuencialmente en el servidor. La propuesta conserva los contornos y coordenadas de la lámina original; fusiona observaciones repetidas sin cerrar huecos no observados. Los píxeles con clase puerta/ventana no se convierten en muros por ser oscuros. Se eliminan ejes de longitud nula tras ajustar encuentros.

Las máscaras de suelo se reparan en sus contactos de píxel antes de simplificar, manteniendo concavidades y exclusiones. La simplificación conserva anclas topológicas y no degenera huecos pequeños en dos puntos. Un recinto cerrado no deja de aportar una superficie de acabado porque exista una detección semántica en otra parte de la hoja. No se crea una losa estructural de toda la imagen ni una cubierta automática.

La revisión de aberturas incorpora recortes y corrección explícita puerta/ventana. Se conserva la evidencia neuronal original y se registra que la categoría fue corregida manualmente. Las predicciones de clases distintas superpuestas no generan dos aberturas en el mismo sitio. La asociación sigue siendo provisional: muchos símbolos pequeños permanecen sin anfitrión y los modelos aún confunden puertas con ventanas.

