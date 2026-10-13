# Detector neuronal experimental y paquetes CAD

## Qué está implementado

El editor CAD tiene un panel «IA». Analiza una planta seleccionada con un U-Net ResNet34 preentrenado, ejecutado localmente en el backend Node mediante ONNX Runtime CPU. Devuelve una máscara de fondo, muros, puertas y ventanas. No envía los planos a un proveedor externo. La inferencia es bajo demanda, no se ejecuta durante la órbita 3D.

La máscara de muros se adelgaza, se vectoriza conservando diagonales y se combina con ejes medidos del CAD que tengan apoyo en la máscara. El procesamiento geométrico ocurre en un worker del navegador. Las propuestas tienen espesores locales, fuente, versión y hashes de los pesos; no se presentan como elementos BIM certificados. La red detecta regiones de puertas/ventanas para revisión visual: sus instancias y anfitriones 3D siguen dependiendo del intérprete CAD, no de una reconstrucción neuronal completa de aberturas.

La opción «Usar la propuesta híbrida CAD + IA en el modelo 3D» es reversible y requiere unidades confirmadas. La propuesta no modifica entidades CAD. Cambiar entidades, capas, unidades o recorte invalida el resultado anterior; una propuesta obsoleta no llega al 3D. Las alturas continúan proviniendo de cotas/vínculos confirmados o figuran como supuestas. La red no deduce alturas, pisos, materiales, estructura ni sistemas MEP. El reconocimiento de muebles, columnas y demás símbolos conserva el intérprete CAD existente y sus limitaciones.

## Selección del candidato, no entrenamiento propio

Se probaron dos modelos públicos con el recorte CAD `au_04`:

| Candidato            | Procedencia fijada                                                                                                | Resultado de prueba técnica                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Yytsi U-Net ResNet34 | [Modelo](https://huggingface.co/Yytsi/floorplan-to-3d-walls), revisión `68843a3ab7b12aa03b23c36f955a0d8099b4e2ee` | No produjo píxeles de muro en ese recorte: no seleccionado.           |
| OpenBIM M2           | [Repositorio y publicación](https://github.com/Chunling1/OpenBIM-FloorPlan-AI/releases/tag/v1.0.0)                | Produjo segmentación no vacía; integrado como candidato experimental. |

Un resultado no vacío no prueba exactitud. No hay precisión, recall ni IoU verificados contra anotación independiente de `au_04` o LCR. Los resultados publicados por los autores no son resultados de Ark. Elegir el candidato observando `au_04` convierte ese archivo en desarrollo/selección: no debe presentarse después como prueba externa ciega.

OpenBIM conserva el preprocesamiento de su implementación: redimensionado a 512×512, normalización ImageNet, orden canónico de clases aplicado al exportar. En el editor se rasteriza un recorte cuadrado que conserva la proporción del plano. No se aplica segmentación de una lámina completa con varios cortes como si fuera una única planta.

El código declara MIT y el entrenamiento utiliza CubiCasa5K, con licencia CC-BY-NC-4.0. No se concluye que esos pesos estén autorizados para uso comercial. Este candidato está bloqueado por defecto en producción; se requiere revisión jurídica/técnica o pesos con derechos adecuados antes de una oferta comercial.

## Instalación reproducible en el backend

Los pesos y `.venv` permanecen en `.data`/directorios ignorados; no forman parte de Git. Node ejecuta inferencia; Python solo exporta el modelo. Desde `teluria-backend`:

```powershell
npm ci
node scripts/download-floorplan-model.mjs
python -m venv .venv
.venv\Scripts\python -m pip install torch==2.14.1 torchvision==0.29.1 --index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\python -m pip install -r scripts/requirements-neural-export.txt
.venv\Scripts\python scripts/export-floorplan-model.py --candidate openbim --directory .data/models/openbim-m2-v1
npm run dev
```

El descargador usa la publicación oficial, comprueba SHA-256 y no sobrescribe un checkpoint existente. El exportador verifica nuevamente el checkpoint, carga con `weights_only=True` y produce `model.onnx` + `manifest.json`. El worker verifica el hash del artefacto ONNX antes de ejecutarlo. Hash del checkpoint M2 seleccionado: `cd7f41460ca1d3cc99bca9c61db8ac83d0381ddec385d55257e3ccb99967ffd7`. La exportación local ensayada produjo `2e2fa138ce3513a715ad1aef247637573d6eb55ef5b93e2c700f2fd70432c3c7`; versiones distintas del exportador pueden producir otro binario, que debe registrarse y auditarse.

Ruta local predeterminada: `.data/models/openbim-m2-v1/model.onnx`. `ARK_NEURAL_MODEL_PATH` admite una ruta alternativa con su manifiesto adyacente. En producción, `ARK_ENABLE_RESEARCH_MODELS=1` es una habilitación explícita de investigación, no una recomendación para el despliegue comercial. La ruta no se expone a los clientes.

La API autenticada `/api/v1/projects/:id/plan-detection` permite consultar disponibilidad y solicitar análisis a miembros autorizados para editar el diseño; no admite clientes ni usuarios ajenos al proyecto. Máximo dos solicitudes pendientes/en ejecución por proceso, una inferencia activa, dos hilos CPU, inicialización limitada a 60 s y solicitudes a 90 s. Imágenes de hasta 16 megapíxeles, 6000 px por lado y cuerpo acotado. No se presupone compatibilidad con un servicio de 512 MB: hay que medir RSS/concurrencia y provisionar memoria antes de Render. Para escala, trasladar este worker a un servicio/cola dedicados; las cuotas por usuario y la cancelación cooperativa siguen pendientes.

## Carpeta DWG suministrada

`Downloads/DWG/DWG` contiene 26 DWG del mismo proyecto LCR/BASE_BBLARCO. Algunas láminas, por ejemplo `PL_002_003...`, son inserciones que requieren `BASE_BBLARCO.dwg`; antes se mostraban vacías al ignorarse la referencia externa. Al resolver la base en la prueba local se extrajeron 28.222 entidades. Ese número demuestra lectura de geometría, no reconocimiento correcto.

Crear proyecto permite elegir un CAD principal y adjuntar sus referencias DWG/DXF. Solo se resuelven archivos seleccionados explícitamente por nombre; nunca se accede a las rutas incrustadas ni se descarga una referencia automáticamente. Se conservan el origen del bloque y la transformación de inserción. Las referencias faltantes/circulares producen errores explícitos. Límite: 32 archivos, 128 MB total, 32 MB por CAD y 8 niveles anidados. Las referencias resueltas se incorporan al CAD editable principal; esto no constituye federación BIM ni convierte todas las otras láminas del paquete en vistas independientes.

En «Reemplazar CAD» se pueden seleccionar el principal y sus referencias; el primer CAD de la selección es el principal. Si se necesita elegirlo explícitamente, usar el selector de CAD principal del formulario de proyecto. Los PDF/imágenes mantienen su límite propio de 3 MB.

Al crear un proyecto se guarda primero el CAD editable sin extruirlo. Las vistas propuestas empiezan excluidas del 3D: delimitar una planta, confirmar sus unidades e incluirla expresamente evita reconstruir todo el contenido de una base multiplanta a escala supuesta. Los cambios de ese CAD se guardan sin reconstrucción mientras la escala siga pendiente. Una reconstrucción que supere 90 segundos se termina y devuelve instrucciones para reducir el recorte, en vez de dejar el formulario esperando indefinidamente.

## Qué falta para evaluar con tus anotaciones

Los DWG por capas son fuentes útiles, pero hay que revisar su correspondencia semántica: qué capas contienen muros, qué símbolos son muebles, qué elementos son demolición/proyección y cómo se asocian aberturas. No se generó ground truth copiando las predicciones. Todos los recortes y láminas de LCR deben pertenecer a una sola partición por edificio. Se necesitan más edificios para entrenamiento/validación/prueba independientes, derechos de uso y revisión arquitectónica identificada.

El [protocolo existente](detector-evaluation-and-correspondence.md) acepta cajas métricas revisadas por clase y anfitrión; el exportador marca `ark-cad-neural-hybrid` cuando el modelo contiene muros neuronales y conserva los hashes del candidato. Además de esa evaluación de cajas, falta medir IoU/Dice de máscaras, conectividad de muros, fidelidad de aberturas y correspondencia entre vistas. Ningún test sintético sustituye esa evaluación.

## Verificación de software

- Frontend: `test:neural`, `test:cad:references`, `test:evidence`, `test:coordination`, `test:detector`, TypeScript, lint y build.
- Backend: `npm test`, incluyendo límites, trazabilidad y autenticación/autorización de la API.
- Comprobación local real: resolución del paquete LCR y solicitud neuronal desde el panel IA de `au_04`; son pruebas de integración, no un benchmark arquitectónico.

Referencia técnica del runtime: [ONNX Runtime Node](https://onnxruntime.ai/docs/get-started/with-javascript/node.html).
