# EngCalc

EngCalc is a local-first educational bolt-shank shear-yield calculator. Version 1 uses a user-supplied nominal tensile yield strength and reports the inputs, units, intermediate values, assumptions, limitations, formula source, and calculator version with each result. It is not a design allowable, safety certification, or engineering approval.

The original project README is preserved in [historical documentation](docs/history/README-2026-10-03-before-v1.md). The v1 calculation model and its evidence are described in [the model note](docs/calculation-model-v1.md).

## Requirements

- Python 3.10 or newer
- Git

The default database is `engcalc.db`, a SQLite file in the project directory. No external database or account is needed for local use. Set `DATABASE_URL` only when deliberately using another SQLAlchemy-supported database.

## Run locally

Clone the repository and enter it:

```powershell
git clone https://github.com/ZephyrianDawnstrider/EngCalc.git
cd EngCalc
```

PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

macOS/Linux shell:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000/ui>. The API schema is at <http://127.0.0.1:8000/docs>. Run tests with `python -m pytest -q`.

## Calculation scope

The model is limited to static, concentric, pure shear of a ductile, isotropic material through a smooth, unthreaded circular shank. It uses the user-provided tensile yield strength, the full shank area at each plane, equal sharing across one or two planes, and a user-selected load factor. The status says whether this simplified estimate is within, at, or above the modeled yield boundary.

It does not evaluate ultimate failure, thread shear, bearing, tear-out, slip, preload, fatigue, eccentricity, bending, or combined loading. See the [model note](docs/calculation-model-v1.md) for the equations and assumptions. The user is responsible for verifying material properties, geometry, and loading; this tool does not select or verify a fastener grade.

## API v1 example

```sh
curl -X POST http://127.0.0.1:8000/api/v1/calculations/bolt-shear \
  -H "Content-Type: application/json" \
  -d '{"tensile_yield_strength_MPa":640,"diameter_mm":8,"applied_shear_N":10000,"shear_planes":1,"fitting_factor":1.0}'
```

The response includes a `report_id`, input snapshot, units, formula, intermediates, assumptions, limitations, and source. Retrieve the persisted snapshot at `/api/v1/reports/{report_id}`. The former grade-preset endpoint `/calculate/shear` returns HTTP 410 because its embedded property data and conditions were not adequately sourced. The v1 endpoint requires an explicit, user-verified `tensile_yield_strength_MPa` value.

## Formula source

The pure-shear von Mises yield relation is `tau_y = Fy / sqrt(3)`. It is derived for an idealized ductile material model in David Roylance's MIT note, [Yield and Plastic Flow](https://web.mit.edu/course/3/3.11/www/modules/yield.pdf), printed page 5. This educational derivation is not a fastener design standard. The previously cited [NASA-TM-2012-217454](https://ntrs.nasa.gov/search.jsp?R=20120003667) studies combined shear and tension failure tests and does not substantiate the superseded formula claim; that historical context is recorded in the model note.

## Browser app

The separate React/TypeScript browser app is version 0.1.0; its calculator model remains version 1.0.0. Calculations run in the browser, and saved reports stay in that browser on that device. After the app shell is cached, calculation, local report history, and JSON export work offline. Reports are not uploaded or synchronized. See [the PWA and browser acceptance note](docs/pwa-v1.md).

Run the browser app locally:

```sh
cd frontend
npm ci
npm run dev
```

Run the frontend tests and production build from the same directory with `npm run test`, `npm run test:browser`, and `npm run build`. The root `render.yaml` describes a manually controlled static site; adding it does not itself create or deploy a hosted service.
