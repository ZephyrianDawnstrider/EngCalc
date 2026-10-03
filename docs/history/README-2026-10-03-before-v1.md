# EngCalc

EngCalc is a production engineering micro-SaaS for calculator-style aerospace and mechanical engineering checks.

## Current Features

- Fastener shear margin calculator
- FastAPI endpoint for shear calculations
- Pytest coverage for calculator behavior

## Project Structure

```text
app/
  main.py
  calculators/
    fastener.py
tests/
  test_fastener.py
requirements.txt
```

## Run Tests

```bash
pytest tests/test_fastener.py -v
```

## Run API Locally

```bash
uvicorn app.main:app --reload
```

Then open:

```text
http://127.0.0.1:8000/docs
```

## Engineering Note

Fastener calculations should be verified against NASA-TM-2012-217454 before use in real engineering work.

# TODO: Add exact standard section references for each calculator formula.
# TODO: Add input units and assumptions for every endpoint.
# TODO: Add versioned calculation reports later.
