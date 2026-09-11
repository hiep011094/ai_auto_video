#!/usr/bin/env python3
"""
schema_validator.py — Lightweight, dependency-free JSON Schema validator for
this project.

USAGE:
  python3 schema_validator.py --schema <schema.json> --file <target.json>

EXIT CODES:
  0 = valid
  1 = INVALID (error list printed to stderr)
  2 = system error (file not readable, malformed JSON, ...)

Supported draft-07 subset used by .agents/schemas/:
  type, const, enum, required, properties, additionalProperties,
  items, minLength, maxLength, minimum, maximum, pattern,
  minItems, maxItems, uniqueItems, allOf (simple if/then)

The implementation is intentionally small and self-contained so CLI agents
can run it without pip/network access.
"""

import argparse
import json
import re
import sys


def type_matches(value, expected_type):
    if isinstance(expected_type, list):
        return any(type_matches(value, t) for t in expected_type)
    if expected_type == "string":
        return isinstance(value, str)
    if expected_type == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected_type == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected_type == "boolean":
        return isinstance(value, bool)
    if expected_type == "array":
        return isinstance(value, list)
    if expected_type == "object":
        return isinstance(value, dict)
    if expected_type == "null":
        return value is None
    return True


def _json_identity(value):
    """Stable representation used by uniqueItems for JSON-compatible values."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def validate(value, schema, path, errors):
    if "type" in schema and not type_matches(value, schema["type"]):
        errors.append(f"{path}: wrong type — expected {schema['type']}, got {type(value).__name__}")
        return

    if "const" in schema and value != schema["const"]:
        errors.append(f"{path}: value '{value}' must be exactly '{schema['const']}'")

    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: value '{value}' is not in the allowed set {schema['enum']}")

    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append(f"{path}: string too short (minimum {schema['minLength']} characters required)")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            errors.append(f"{path}: string too long ({len(value)} characters; maximum {schema['maxLength']})")
        if "pattern" in schema and re.match(schema["pattern"], value) is None:
            errors.append(f"{path}: value '{value}' does not match pattern '{schema['pattern']}'")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: value {value} is below minimum {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: value {value} is above maximum {schema['maximum']}")

    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(f"{path}: array has fewer items than required (minimum {schema['minItems']})")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{path}: array has more items than allowed (maximum {schema['maxItems']})")
        if schema.get("uniqueItems"):
            seen = set()
            for idx, item in enumerate(value):
                ident = _json_identity(item)
                if ident in seen:
                    errors.append(f"{path}[{idx}]: duplicate array item is not allowed (uniqueItems=true)")
                seen.add(ident)
        if "items" in schema:
            for idx, item in enumerate(value):
                validate(item, schema["items"], f"{path}[{idx}]", errors)

    if isinstance(value, dict):
        required = schema.get("required", [])
        for req_field in required:
            if req_field not in value:
                errors.append(f"{path}: missing required field '{req_field}'")

        properties = schema.get("properties", {})
        for key, subschema in properties.items():
            if key in value:
                validate(value[key], subschema, f"{path}.{key}", errors)

        if schema.get("additionalProperties") is False:
            extras = sorted(set(value.keys()) - set(properties.keys()))
            for key in extras:
                errors.append(f"{path}: unexpected field '{key}' (additionalProperties=false)")

        # Support the simple allOf/if-then pattern used by project schemas.
        for cond in schema.get("allOf", []):
            if "if" in cond and "then" in cond and _matches_condition(value, cond["if"]):
                validate(value, cond["then"], path, errors)


def _matches_condition(value, if_schema):
    props = if_schema.get("properties", {})
    for key, subschema in props.items():
        if key not in value:
            return False
        if "const" in subschema and value[key] != subschema["const"]:
            return False
    return True


def main():
    parser = argparse.ArgumentParser(description="Validate a JSON file against its required schema.")
    parser.add_argument("--schema", required=True, help="Path to the JSON schema file")
    parser.add_argument("--file", required=True, help="Path to the JSON file to check")
    args = parser.parse_args()

    try:
        with open(args.schema, "r", encoding="utf-8") as f:
            schema = json.load(f)
    except Exception as e:
        print(f"ERROR: could not read schema '{args.schema}': {e}", file=sys.stderr)
        sys.exit(2)

    try:
        with open(args.file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"ERROR: could not read JSON file '{args.file}': {e}", file=sys.stderr)
        sys.exit(2)

    # queue.json is commonly a task array while queue.schema.json describes
    # one task object. Preserve smart-selection ONLY for the queue schema.
    # Other object schemas (notably history.schema.json, which describes one
    # history entry) must reject an array root so callers cannot accidentally
    # validate just one element and mistake that for whole-file validation.
    if (isinstance(data, list) and schema.get("type") == "object"
            and schema.get("title") == "queue.json task"):
        if not data:
            print(f"ERROR: '{args.file}' is an empty array — nothing to validate.", file=sys.stderr)
            sys.exit(2)
        pending_tasks = [t for t in data if isinstance(t, dict) and t.get("status") == "pending"]
        task = pending_tasks[-1] if pending_tasks else data[-1]
        print(
            f"INFO: '{args.file}' is an array with {len(data)} task(s). "
            f"Validating the {'last pending' if pending_tasks else 'last'} task "
            f"(id={task.get('id', 'unknown')})."
        )
        data = task

    errors = []
    validate(data, schema, "$", errors)

    if errors:
        print(f"INVALID — {args.file} has {len(errors)} error(s):", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        sys.exit(1)

    print(f"OK: {args.file} is valid against schema {args.schema}")
    sys.exit(0)


if __name__ == "__main__":
    main()
