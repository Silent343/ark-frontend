# Reconocimiento neuronal: ampliación experimental

## Alcance implementado

El panel **IA** del editor CAD permite elegir entre dos detectores locales ejecutados con ONNX Runtime CPU:

- **OpenBIM M2**: fondo, muros, puertas y ventanas.
- **CubiCasa multitarea**: las anteriores más armarios, equipos eléctricos genéricos, inodoros, lavabos, bancos de sauna, chimeneas de interior, bañeras, conductos de chimenea y barandas.

Son clases aprendidas de los pesos públicos, no categorías añadidas mediante palabras clave. No incluyen sillas, camas, escaleras, columnas, vigas, cubiertas, materiales ni instalaciones completas. «Equipo» no identifica un circuito eléctrico. La categoría de banco procede de sauna; su vista 3D es una aproximación paramétrica, no una identificación de cualquier mobiliario.

La integración nueva se aplica al **CAD rasterizado por regiones**. La importación general de imágenes/PDF sigue utilizando su pipeline existente; no se ha sustituido silenciosamente por este detector.

### Escala y recortes

Se requieren unidades CAD confirmadas y una región de tipo planta. El usuario elige 1, 2,5, 5 o 10 cm/píxel; la planta se divide en recortes de 512×512 con al menos 20 % de solapamiento. No se comprime todo un edificio dentro de 512 píxeles.

Se analiza secuencialmente, se vectoriza en un worker del navegador y se conserva solo una miniatura de hasta 1024 px. Máximo 128 recortes, 10.000 segmentos acumulados y presupuestos explícitos de símbolos/comparaciones. Si se exceden los límites se pide un recorte menor; no se guarda una propuesta parcial como completa. El trabajo completo tiene un límite de 20 minutos.

Los ejes CAD se reconstruyen una sola vez y se recortan para medir apoyo en cada máscara. Se fusionan tramos colineales solapados sin rellenar huecos reales por proximidad. Esto no resuelve por sí mismo todos los encuentros, vacíos o sistemas constructivos.

### De máscaras a objetos revisables

Las salidas son **segmentación semántica**, no un modelo entrenado de segmentación por instancias. Se extraen componentes conectados, se crean envolventes convexas y se fusionan duplicados entre recortes mediante intersección poligonal. Los componentes distintos observados en un mismo recorte se mantienen separados. Símbolos pegados pueden seguir fundiéndose: requieren revisión.

Las puertas y ventanas se asocian a ejes con pruebas de proyección, anchura física, extensión y distancia lateral. Dos anfitriones empatados producen «ambiguo»; la ausencia de evidencia produce «sin anfitrión». No se fuerza un muro cercano.

El panel permite introducir altura y antepecho y marcar cada objeto como revisado. **Solo los objetos aprobados de una propuesta aplicada y vigente llegan al Blueprint y al 3D.** Las aberturas incluyen wallId real; si su altura no cabe, no se recorta ni inventa otra dimensión. La carpintería CAD medida tiene prioridad sobre duplicados neuronales. Armarios, equipos, sanitarios y otras huellas aprobadas generan volúmenes paramétricos de bajo coste GPU. Las barandas quedan pendientes en 2D porque su sistema/altura no se deduce de esta máscara.

El usuario debe verificar la categoría, la geometría y su pertenencia a la planta. Aprobar una propuesta no es certificar su exactitud. Los scores softmax se consideran **no calibrados**, nunca probabilidad de corrección arquitectónica.

### Trazabilidad y seguridad

Se guardan revisión, SHA-256 del checkpoint/ONNX, firma de la fuente, detalle/recortes completos y aprobaciones. Cambiar entidades, capas, unidades o recorte invalida el análisis. Las ediciones verticales no invalidan la imagen, pero el compilador vuelve a comprobar dimensiones.

Frontend y backend validan clases por modelo, polígonos convexos finitos, IDs, presupuesto de recortes, anfitriones y dimensiones explícitas. La API autenticada conserva la autorización de edición de diseño; no permite analizar proyectos ajenos.

El backend mantiene **una sesión ONNX residente y una inferencia activa**, con dos hilos CPU y como máximo dos solicitudes activas/pendientes. Cambiar modelo libera la sesión anterior. Cancelar una solicitud activa no despacha otra inferencia mientras el trabajo nativo sigue ejecutándose; su watchdog de 90 s permanece activo. No hay llamadas a proveedores externos, entrenamiento automático ni descarga al iniciar el servidor.

## Procedencia y límites de uso

Fuentes primarias:

- [CubiCasa5K, código y dataset](https://github.com/CubiCasa/CubiCasa5k).
- [Definición oficial de las salidas del modelo](https://github.com/CubiCasa/CubiCasa5k/blob/c34440266665a11f4484eb06cd2e4b7d72ad76c1/samples.ipynb).
- [Arquitectura hourglass original fijada](https://github.com/CubiCasa/CubiCasa5k/blob/c34440266665a11f4484eb06cd2e4b7d72ad76c1/floortrans/models/hg_furukawa_original.py).
- [OpenBIM M2, publicación oficial](https://github.com/Chunling1/OpenBIM-FloorPlan-AI/releases/tag/v1.0.0).
- [ONNX Runtime Node](https://onnxruntime.ai/docs/get-started/with-javascript/node.html).

CubiCasa conserva los 12 logits de ambientes y 11 logits de iconos; los 21 mapas de puntos de unión no se usan en esta ampliación. La normalización RGB es [-1,1], no ImageNet. Se mapean los iconos y las clases muro/baranda a un vocabulario canónico de 13 etiquetas, incluyendo fondo. No se deduce que el resto de ambientes proporcione geometría BIM.

El código/dataset CubiCasa declara **CC-BY-NC-4.0**. OpenBIM declara MIT para su código y utiliza ese dataset en entrenamiento. Ninguna de estas integraciones constituye autorización comercial de los pesos. Los candidatos de investigación están bloqueados por defecto en producción. Se necesitan derechos adecuados o revisión de licencia antes de una oferta comercial.

No se entrenó un modelo propio ni se midió su exactitud arquitectónica. Seleccionar candidatos observando au_04 convierte ese archivo en desarrollo, no prueba ciega. Los resultados publicados por terceros no son resultados de Ark.

## Instalación explícita en backend

Los modelos y el entorno Python quedan ignorados en Git. Node ejecuta inferencia; Python se usa solo para exportar.

```powershell
npm ci
python -m venv .venv
.venv\Scripts\python -m pip install torch==2.14.1 torchvision==0.29.1 --index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\python -m pip install -r scripts/requirements-neural-export.txt

# Modelo anterior
node scripts/download-floorplan-model.mjs
.venv\Scripts\python scripts/export-floorplan-model.py --candidate openbim --directory .data/models/openbim-m2-v1

# Modelo ampliado, de investigación
node scripts/download-cubicasa-model.mjs
.venv\Scripts\python scripts/export-cubicasa-model.py --directory .data/models/cubicasa-multitask-v1
npm run dev
```

El descargador no sobrescribe archivos existentes y verifica hashes fijados del checkpoint, código original y licencia. El exportador carga pesos con weights_only=True y audita de nuevo los hashes. El código original descargado se mantiene con su licencia en .data, no se copia al código de Ark. El worker verifica el hash ONNX antes de abrirlo.

| Artefacto CubiCasa            | SHA-256                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| Checkpoint oficial            | dd20b4e1bf1d670f2125107b079df06958b1ccd36e49a464ab739aeb00b8e7a2 |
| Fuente de arquitectura fijada | 05a07265d9ec8cade5228b834645af00c655e1413b21d02b0b3183d041f7752a |
| ONNX local ensayado           | 5f8d472122a68302c8991fd2853d6dfc5773f99e88e85c3941e05cfdf317eb4f |

Revisión upstream: c34440266665a11f4484eb06cd2e4b7d72ad76c1. El ONNX local ocupa aproximadamente 69,5 MB; otra versión de exportación puede cambiar el binario y debe registrar su propio hash.

Se descubren ambos manifiestos instalados en .data/models. ARK_NEURAL_MODEL_PATH permite un modelo adicional conocido con su manifiesto adyacente. ARK_ENABLE_RESEARCH_MODELS=1 habilita explícitamente investigación en producción, **no recomienda su explotación comercial**. Reiniciar el backend después de instalar modelos.

Subir el código a GitHub no instala los pesos en Render. Deben provisionarse como artefactos del servidor, con sus licencias y manifiestos, fuera del repositorio. No se presupone que 512 MB sean suficientes. El smoke local del plano de referencia observó aproximadamente 389 MiB RSS de proceso con el modelo ampliado, sin representar carga máxima del backend. Medir memoria pico, latencia y concurrencia en el entorno de despliegue. Para escala siguen pendientes cola dedicada, cuotas por usuario y servicio de inferencia separado.

## Verificación realizada

- Pruebas unitarias: taxonomía de cabezas, rechazo de logits NaN, instancias, solapamientos, unidades, padding, anfitriones ambiguos, aprobación explícita, alturas, duplicados y fuente obsoleta.
- Navegador con API completamente interceptada: dos recortes, una abertura y un lavabo fusionados, edición de dimensiones, aprobación/guardado validado por backend, móvil y vista del modelo sin errores JavaScript.
- Smoke con pesos reales sobre casa-aguilas-planta-baja.jpg: M2 ~1,6 s y CubiCasa ~3,0 s en esta máquina. Salidas no vacías; no es un benchmark de exactitud.
- Smoke integral sobre el fixture técnico au_04: cuatro recortes de 5 cm/píxel, ~10,9 s de inferencia acumulada; 152 segmentos, 26 propuestas de aberturas y solo 5 anfitriones no ambiguos. Las otras 21 quedan pendientes. El resto de objetos propuestos en esa ejecución fueron barandas, no equipamiento validado. No se alteró el proyecto real.

Reproducir:

```powershell
# Backend, opt-in: requiere pesos locales
node scripts/check-neural-models.mjs ../teluria-frontend/public/sources/casa-aguilas-planta-baja.jpg

# Frontend, servidor de prueba aislado en 3015
npm run test:neural
npm run test:neural:browser
# Opt-in con un Blueprint CAD local: API interceptada e inferencia local real
node scripts/check-cad-neural.mjs .data/qa/au_04-neural-v6.json
```

Las rutas .data/qa son fixtures/resultados locales ignorados, no datos distribuidos con Git.

## Carpeta DWG suministrada

`Downloads/DWG/DWG` contiene 26 DWG del mismo proyecto LCR/BASE_BBLARCO. Algunas láminas, por ejemplo `PL_002_003...`, son inserciones que requieren `BASE_BBLARCO.dwg`; antes se mostraban vacías al ignorarse la referencia externa. Al resolver la base en la prueba local se extrajeron 28.222 entidades. Ese número demuestra lectura de geometría, no reconocimiento correcto.

Crear proyecto permite elegir un CAD principal y adjuntar sus referencias DWG/DXF. Solo se resuelven archivos seleccionados explícitamente por nombre; nunca se accede a las rutas incrustadas ni se descarga una referencia automáticamente. Se conservan el origen del bloque y la transformación de inserción. Las referencias faltantes/circulares producen errores explícitos. Límite: 32 archivos, 128 MB total, 32 MB por CAD y 8 niveles anidados. Las referencias resueltas se incorporan al CAD editable principal; esto no constituye federación BIM ni convierte todas las otras láminas del paquete en vistas independientes.

En «Reemplazar CAD» se pueden seleccionar el principal y sus referencias; el primer CAD de la selección es el principal. Si se necesita elegirlo explícitamente, usar el selector de CAD principal del formulario de proyecto. Los PDF/imágenes mantienen su límite propio de 3 MB.

Al crear un proyecto se guarda primero el CAD editable sin extruirlo. Las vistas propuestas empiezan excluidas del 3D: delimitar una planta, confirmar sus unidades e incluirla expresamente evita reconstruir todo el contenido de una base multiplanta a escala supuesta. Los cambios de ese CAD se guardan sin reconstrucción mientras la escala siga pendiente. Una reconstrucción que supere 90 segundos se termina y devuelve instrucciones para reducir el recorte, en vez de dejar el formulario esperando indefinidamente.

## Datos independientes y siguiente fase

Downloads/DWG/DWG contiene 26 DWG del mismo edificio LCR/BASE_BBLARCO. Son fuentes CAD útiles, no anotaciones arquitectónicas independientes verificadas. Sus láminas/recortes deben permanecer en una sola partición por edificio. Crear proyecto permite adjuntar el CAD principal y sus referencias seleccionadas explícitamente; no accede a las rutas incrustadas.

Para resolver la brecha observada falta: revisar ground truth por clase/instancia/anfitrión, reunir varios edificios y derechos de uso, separar entrenamiento/validación/prueba por edificio, medir máscaras y conectividad además de cajas, y ajustar/entrenar para el dominio de CAD local. No copiar predicciones como ground truth. La correspondencia entre plantas, cortes y cuadros sigue siendo necesaria para obtener alturas y sistemas constructivos.

El [protocolo de evaluación existente](detector-evaluation-and-correspondence.md) admite cajas métricas revisadas por clase y anfitrión. El exportador conserva las versiones/hashes y los objetos aprobados del modelo. Aún falta un benchmark de IoU/Dice, asociación de aberturas y consistencia entre vistas. Ningún test sintético ni conteo de detecciones reemplaza esa validación; no se genera un BIM profesional validado automáticamente.
