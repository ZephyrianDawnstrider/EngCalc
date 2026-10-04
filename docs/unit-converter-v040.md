# Engineering unit converter — 4 October 2026, v0.4.0

Supersedes the three-quantity SI-prefix converter described in the v0.2.0 audit. Earlier documents remain historical evidence.

## Scope

Twenty quantities: force, pressure/stress, length, area, volume, mass, torque, energy, power, speed, acceleration, density, volumetric flow, dynamic viscosity, kinematic viscosity, absolute temperature, temperature difference, angle, time and frequency. The UI supports quantity/unit-name search, labelled units, swap direction, and equivalent values in every unit of the selected quantity. It retains the input number when units are swapped. Display rounds to twelve significant digits; the conversion function retains JavaScript double precision for calculator use.

## Definitions and boundaries

Primary reference: [NIST SP 811 Appendix B.8](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8). The page publishes some derived factors rounded to seven significant digits. Source computes derived customary factors from exact definitions: inch = 0.0254 m; international foot = 0.3048 m; avoirdupois pound = 0.45359237 kg; standard gravity = 9.80665 m/s²; US liquid gallon = 231 cubic inches; Imperial gallon = 4.54609 L. International acre uses 43,560 international square feet; this is explicitly different from the survey-foot acre listed in the older NIST table. Btu uses the International Table convention (1055.05585262 J), while calorie uses the thermochemical convention (4.184 J). Mechanical horsepower = 550 ft·lbf/s; metric horsepower = 75 kgf·m/s. Knot uses the international nautical mile (1852 m).

Absolute temperature includes offsets and rejects values below absolute zero. Temperature intervals apply scale only and may be negative. Pressure scaling does not change gauge to absolute pressure. Mass/force, torque/energy, dynamic/kinematic viscosity and volumetric/mass flow remain distinct quantities. No density, material property, design check or currency rate is inferred. Frequency in cycles/min is not angular velocity in rad/s. No conversion results are saved; report stores and calculator schemas are untouched.

## Verification

`npm run check`: TypeScript and 73 tests across six files passed. Reference cases cover every quantity, temperature fixed points and absolute-zero boundaries, US/Imperial gallons, international area definitions, mechanical/metric horsepower, numeric range rejection, and all-unit round trips. React DOM journeys exercise quantity search/reset, unit selection/swap, equivalent selection, invalid-input output clearing, and existing report/draft preservation across modules. These are jsdom checks, not real-browser visual acceptance.

The user supplied a screenshot showing v0.3.0 had reached their browser after the earlier v0.1.0 screenshot. This resolves the immediate old-interface observation, but does not establish its exact cause or prove a change to the PWA update mechanism. The implementation still activates a waiting worker on request and defers page replacement to a later navigation. No cache, service-worker registration or saved site data was cleared.

Fresh browser automation remains unavailable: Browser Use could not verify saved browser permissions and denied navigation. No alternate browser mechanism was used to bypass that control. Desktop/mobile rendering, offline runtime and prior-version upgrade behavior remain unverified for v0.4.0. Production build and hosted deployment identity are recorded in the external release receipt.
