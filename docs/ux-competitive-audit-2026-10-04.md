# EngCalc workflow audit — 4 October 2026

## Scope

EngCalc's opportunity is a small, legible, local-first engineering workbench: quick input, transparent model output, easy scenario comparison, and portable reports. It is not a substitute for connection-design software. The only structural calculation remains the verified educational bolt-shank shear-yield model v1.0.0; a separate SI prefix converter adds utility without introducing a structural design model.

## Official-source comparison

| Product and official source | Observed workflow | EngCalc response |
| --- | --- | --- |
| [Autodesk Inventor Bolted Connection Generator](https://help.autodesk.com/cloudhelp/2025/ENU/Inventor-Help/files/GUID-3A51B44B-7C58-44F2-A608-3932A9F787E7.htm) | Assembly-oriented fastener generation and calculation; selectable design tasks for diameter, number, material, and strength. | A focused input/result workbench, visible model scope, and a worked example. EngCalc neither inserts CAD components nor provides Inventor's connection checks. |
| [Hilti PROFIS Engineering](https://www.hilti.com/content/hilti/W1/US/en/business/business/engineering/profis-engineering.html) | Application modules, templates, load combinations/import, and documented reporting. | A restrained module selector, saved local scenarios, and explicit reports. EngCalc does not select anchors, check concrete, or implement Hilti's design methods. |
| [IDEA StatiCa connection workflow](https://www.ideastatica.com/support-center/support-center-tutorials/advance-design-bim-link-for-steel-connection-design-en) | Import, review geometry/material mapping and loads, analyze, inspect checks, and report. | Keep evaluated inputs beside the result; preserve report identity and expose equations, assumptions, and source. EngCalc has no finite-element analysis or BIM import. |
| [SkyCiv Connection Design](https://skyciv.com/docs/skyciv-connection-design/getting-started/) | A guided choice of connection types with specific workflows and reports. | Two available tools: the bolt model and SI units. One clearly unavailable future connection-check card avoids a catalogue full of placeholders. |

These are workflow adaptations, not feature-parity or accuracy-superiority claims. The official references were reviewed on 4 October 2026.

## Implemented in browser app v0.2.0

- Compact navigation and scope notice put the calculator near the top. Inputs and results share the desktop workbench and stack on small screens.
- The result emphasizes nominal modeled capacity, factored demand, model margin, and the demand/capacity ratio. It never uses a safe/approved status.
- N/kN entry normalizes to the same canonical N report. No rounding is applied before calculation; unsupported overflow/underflow is rejected.
- A session-only pinned baseline compares two immutable report snapshots including all five inputs, capacity, demand, and margin. Opening history does not recalculate or modify saved bytes.
- Existing JSON and print outputs remain available. Print content includes the evaluated input snapshot, model equations, identity, all assumptions/limitations, and source.
- The independent SI converter covers force (N/kN/MN), stress (Pa/kPa/MPa/GPa), and length (mm/cm/m). Factors follow [NIST SI prefixes](https://www.nist.gov/pml/owm/metric-si-prefixes); it performs dimensional scaling only.
- App/cache version advances to 0.2.0. Model, report, and local history versions remain unchanged; no migration or history eviction was introduced.

## Next validated module path

Bearing or axial tension is a possible next model, not a shipped feature. Before release: identify the exact use case and reference, document the material/geometry/load inputs and excluded failure modes, derive independently checked examples and boundary cases, version the model/report contract, then add its interface and offline acceptance tests. Combined loading and any code-specific design check require their own evidence; they must not be inferred from today's bolt-shank model.

## Validation gate

The release evidence is appended to [the PWA note](pwa-v1.md). Source tests and a successful build do not establish visual, print-layout, physical-install, or true offline-browser acceptance. Browser permission infrastructure was unavailable during this change; those gates are explicitly separate.


## 4 October 2026 — implemented next-model update

The first bounded increment after v0.2.0 is the [Round-shank axial yield model](axial-yield-model-v1.md), introduced in app v0.3.0. It estimates nominal member yield under uniform axial tension with a sourced mechanics relation, separate report/history contract, and independent example/tests. This supersedes the earlier future-path reference to axial tension only. Threaded-bolt design, bearing, joint behavior, combined loading, and code-specific connection checks remain unavailable.
