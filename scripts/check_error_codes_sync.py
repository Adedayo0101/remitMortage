#!/usr/bin/env python3
"""Keep ERROR_CODES.md in sync with the `#[contracterror]` enums in
contracts/*/src/errors.rs.

Usage:
    scripts/check_error_codes_sync.py          # fail if ERROR_CODES.md is stale
    scripts/check_error_codes_sync.py --write  # regenerate ERROR_CODES.md in place

Also fails (independent of --write) if any errors.rs enum assigns the same
discriminant value to more than one variant.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTRACTS_DIR = REPO_ROOT / "contracts"
OUTPUT_FILE = REPO_ROOT / "ERROR_CODES.md"

ENUM_RE = re.compile(
    r"#\[contracterror\][^\n]*\n(?:#\[[^\n]*\]\n)*\s*pub enum (\w+)\s*\{(.*?)\n\}",
    re.DOTALL,
)
VARIANT_RE = re.compile(
    r"((?:[ \t]*///[^\n]*\n)*)[ \t]*(\w+)\s*=\s*(\d+)\s*,",
)


class Variant:
    def __init__(self, name: str, value: int, doc: str):
        self.name = name
        self.value = value
        self.doc = doc


def parse_errors_file(path: Path) -> list[tuple[str, list[Variant]]]:
    text = path.read_text()
    enums: list[tuple[str, list[Variant]]] = []
    for match in ENUM_RE.finditer(text):
        enum_name, body = match.group(1), match.group(2)
        variants: list[Variant] = []
        for vmatch in VARIANT_RE.finditer(body):
            doc_block, name, value = vmatch.groups()
            doc_lines = [
                line.strip().removeprefix("///").strip()
                for line in doc_block.splitlines()
                if line.strip()
            ]
            variants.append(Variant(name, int(value), " ".join(doc_lines)))
        enums.append((enum_name, variants))
    return enums


def collect() -> dict[str, list[tuple[str, list[Variant]]]]:
    found: dict[str, list[tuple[str, list[Variant]]]] = {}
    for errors_rs in sorted(CONTRACTS_DIR.glob("*/src/errors.rs")):
        crate_name = errors_rs.parent.parent.name
        enums = parse_errors_file(errors_rs)
        if enums:
            found[crate_name] = enums
    return found


MAX_VARIANTS_PER_ENUM = 50  # ScSpecUdtErrorEnumV0.cases: VecM<_, 50> in stellar-xdr


def check_variant_caps(contracts: dict[str, list[tuple[str, list[Variant]]]]) -> list[str]:
    problems = []
    for crate_name, enums in contracts.items():
        for enum_name, variants in enums:
            if len(variants) > MAX_VARIANTS_PER_ENUM:
                problems.append(
                    f"{crate_name}::{enum_name} has {len(variants)} variants, over the "
                    f"Soroban #[contracterror] cap of {MAX_VARIANTS_PER_ENUM}"
                )
    return problems


def check_duplicate_discriminants(
    contracts: dict[str, list[tuple[str, list[Variant]]]],
) -> list[str]:
    problems = []
    for crate_name, enums in contracts.items():
        for enum_name, variants in enums:
            seen: dict[int, str] = {}
            for variant in variants:
                if variant.value in seen:
                    problems.append(
                        f"{crate_name}::{enum_name}: discriminant {variant.value} used by "
                        f"both '{seen[variant.value]}' and '{variant.name}'"
                    )
                else:
                    seen[variant.value] = variant.name
    return problems


def render(contracts: dict[str, list[tuple[str, list[Variant]]]]) -> str:
    lines = [
        "# Error Codes",
        "",
        "Auto-generated from `contracts/*/src/errors.rs` by "
        "`scripts/check_error_codes_sync.py --write`. Do not edit by hand — "
        "update the doc comments in the source enum and regenerate instead.",
        "",
    ]
    for crate_name, enums in contracts.items():
        for enum_name, variants in enums:
            lines.append(f"## {crate_name} (`{enum_name}`)")
            lines.append("")
            lines.append("| Code | Variant | Description |")
            lines.append("|------|---------|-------------|")
            for variant in sorted(variants, key=lambda v: v.value):
                lines.append(f"| {variant.value} | `{variant.name}` | {variant.doc} |")
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write", action="store_true", help="regenerate ERROR_CODES.md in place"
    )
    args = parser.parse_args()

    contracts = collect()
    if not contracts:
        print("error-codes-sync: found no contracts/*/src/errors.rs files", file=sys.stderr)
        return 1

    dup_problems = check_duplicate_discriminants(contracts)
    if dup_problems:
        print("error-codes-sync: duplicate discriminant values found:", file=sys.stderr)
        for problem in dup_problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    cap_problems = check_variant_caps(contracts)
    if cap_problems:
        print("error-codes-sync: enum variant cap exceeded:", file=sys.stderr)
        for problem in cap_problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    generated = render(contracts)

    if args.write:
        OUTPUT_FILE.write_text(generated)
        print(f"error-codes-sync: wrote {OUTPUT_FILE.relative_to(REPO_ROOT)}")
        return 0

    if not OUTPUT_FILE.exists():
        print(
            f"error-codes-sync: {OUTPUT_FILE.relative_to(REPO_ROOT)} does not exist. "
            "Run `scripts/check_error_codes_sync.py --write` and commit the result.",
            file=sys.stderr,
        )
        return 1

    current = OUTPUT_FILE.read_text()
    if current != generated:
        print(
            f"error-codes-sync: {OUTPUT_FILE.relative_to(REPO_ROOT)} is out of date "
            "with contracts/*/src/errors.rs.\n"
            "Run `scripts/check_error_codes_sync.py --write` and commit the result.",
            file=sys.stderr,
        )
        return 1

    print("error-codes-sync: ERROR_CODES.md is up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
