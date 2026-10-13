# Reconstrucción CAD y planos raster: validación local

## Cambios

- Los títulos CAD decodifican subrayados y caracteres Unicode. `TERRAZA` como nombre de ambiente ya no recorta el proyecto ni convierte todos sus muros en parapetos. Se reconocen planta baja, alta y azotea.
- La partición entre plantas usa la posición real del título, sin un desplazamiento tipográfico supuesto que cortaba y duplicaba partes de plantas vecinas en `cs06`.
- Sin títulos de planta, los muros delimitan la propuesta. Símbolos sueltos de puertas lejos del restaurante ya no amplían el encuadre 3D; se conservan en el CAD original.
- Capas numéricas: propuestas por caras paralelas, separación y repetición. Las asignaciones manuales tienen prioridad. Se excluyen cotas y anotaciones de estas inferencias.
- Los bloques conservan nombre e identidad de instancia al descomponerse. Mobiliario y equipo reconocibles generan objetos paramétricos con referencias a sus entidades de origen. Símbolos desconocidos conservan su representación 2D.
- Se distinguen hojas y arcos de puertas y ventanas en capas mixtas. Las escaleras no desaparecen porque solo haya un nivel importado.
- El mobiliario comparte cinco lotes de geometría/material por nivel; no hay una llamada de dibujo por asiento. El análisis CAD se ejecuta en un worker también durante la creación del proyecto.
- Las imágenes conservan su color durante el análisis: los rellenos no deben convertirse en muros. Se proponen contornos de superficies coloreadas con límites de tamaño y complejidad.
- El formulario explica unidades, pisos/sótanos, límites de archivo, calibración y pasos posteriores. Los parámetros de simulación quedan separados de la importación.

## Archivos suministrados

Resultados de propuestas, **no métricas de precisión ni certificación BIM**. No se incorporaron los DWG privados al repositorio.

| Fuente | Muros | Puertas | Ventanas | Mobiliario/equipo | Niveles |
| --- | ---: | ---: | ---: | ---: | ---: |
| rt02.dwg | 117 | 8 | 9 | 141 | 1 |
| cs06.dwg | 201 | 12 | 28 | 37 | 3 |
| au_04.dwg | 94 | 6 | 4 | 238 | 1 |

La imagen suministrada (547 × 569 px) propone 39 tramos de muro y 9 superficies. No se le asignó una escala métrica inventada.

## Límites pendientes

- No es un reconocedor universal ni un sistema entrenado de visión. Una fotografía no permite recuperar con certeza cada mueble, material, instalación, altura o elemento oculto.
- El auditorio aún contiene símbolos sin clasificar. El número de propuestas no equivale al aforo escrito en el plano.
- Las unidades CAD siguen pendientes de confirmación; la cabecera del archivo puede contradecir la geometría. Alturas y acabados son valores provisionales.
- Los objetos son aproximaciones paramétricas de la huella, no modelos de fabricante. Escaleras, huecos, plantas alineadas, patios y cubiertas necesitan revisión.
- Archivos ya importados antes de conservar nombres de bloque necesitan reimportarse para recuperar esa evidencia. La vista 3D actualiza reconstrucciones antiguas sin sobrescribir automáticamente el original guardado.

## Pruebas

`npm run test:cad`, `npm run test:plans`, `npm run test:evidence`, `npx tsc --noEmit` y ESLint sobre los archivos modificados. En backend, `npm test` requiere permitir conexiones locales para las pruebas de integración PostgreSQL/API.

Se guardaron copias independientes `Revisión CAD · au_04`, `Revisión CAD · rt02` y `Revisión CAD · cs06` en la cuenta de vista previa local para comparar resultados sin modificar los proyectos originales.
