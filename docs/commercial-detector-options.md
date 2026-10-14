# Recognition alternatives and first parametric families

Reviewed 2026-10-13 against primary publisher sources.

## Alternatives to CubiCasa

| Candidate | Publisher's license evidence | Suitable role | Work still required |
| --- | --- | --- | --- |
| [Meta SAM 2.1](https://github.com/facebookresearch/sam2#license) | Publisher explicitly licenses model checkpoints and training code under Apache 2.0. | Assisted segmentation using points or boxes; useful for creating/reviewing masks. | Dedicated inference adapter, resource measurements and evaluation on drawings. Masks have no architectural category or height. |
| [RT-DETR / RT-DETRv2](https://github.com/lyuwenyu/RT-DETR) | Official repository is Apache 2.0; supports custom training and ONNX export. | Train symbol detection on authorized plans, then associate detections with CAD topology and 3D families. | Authorized annotations, a trained checkpoint and independent evaluation. Do not assume the repository license clears every external dataset or checkpoint. |
| [Microsoft Florence-2-base](https://huggingface.co/microsoft/Florence-2-base) | Official model card identifies MIT. | Candidate for OCR and region proposals. | Verify extraction accuracy; language/vision output is not measured architectural geometry. |

Recommended path: SAM 2.1 for assisted annotations, RT-DETRv2 trained on project-owned/authorized plan annotations for semantic detection, and the existing deterministic CAD/topology pipeline for metric reconstruction. The first two are **selected candidates, not installed production replacements**. Do not reuse a checkpoint trained on restricted plans as a shortcut to a rights-cleared detector. CubiCasa and OpenBIM remain opt-in research integrations; production still blocks them by default.

SAM's published GPU benchmark is not a CPU or Render 512-MB benchmark. Run neural inference as a separate worker when its measured memory/latency requires it. Keep the user-facing API and plan persistence separate from that worker.

## First family delivery

24 original procedural types cover furniture and sanitary fixtures: standard/auditorium/office chairs, rectangular/oval tables, two/three-seat sofas, single/double beds, floor/wall toilets, vanity/pedestal/wall basins, base/tall cabinets, timber bench, inset/free bathtub, fireplace, chimney, generic equipment, plant and vehicle.

Each assembly follows the source footprint, rotation, height and level. Explicit names such as “butaca” can suggest a compatible type; this is a display suggestion, not new recognition evidence. Manual type, finish and elevation choices live in `Blueprint.fixtureFamilies`, survive CAD reconstruction and are included in canonical JSON. Compatible types are editable from the model inspector, with an explicit option to apply to objects of the same kind on the same level. Choosing a family never changes the detection's review status. Persisted changes retain the normal REST revision conflict checks and server-side validation.

Rounded parts and hollow basins/seats use shared instanced primitives. Draw calls depend on material/primitive combinations rather than the number of chairs. Low render quality switches to reduced assemblies. These are generic parametric representations, not manufacturer/Revit families; joinery, advanced stair configurations, reinforcement and HVAC catalogs are subsequent deliveries.

Verification: `npm run test:families`, TypeScript, lint, canonical/neural regression tests and production build. Independent architectural accuracy and real-world clearances remain separate evaluation tasks.
