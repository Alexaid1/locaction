"""Проверка контракта LOCACTION: примеры и любые JSON-файлы против схем contract/*.schema.json.

    python tools/check_contract.py                       # все примеры из contract/examples
    python tools/check_contract.py card my-card.json     # свой файл карточки (card | params | explain | parse)

Для разбора (explain) дополнительно проверяется правило ИКР: в тексте нет чисел,
которых нет в карточке. Нужен пакет jsonschema (4.18+).
"""
import json
import re
import sys
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parents[1] / 'contract'
SCHEMAS = {name: json.loads((ROOT / f'{name}.schema.json').read_text(encoding='utf-8'))
           for name in ('params', 'card', 'explain')}
REGISTRY = Registry().with_resources(
    (f'https://locaction/contract/{name}.schema.json', Resource.from_contents(schema))
    for name, schema in SCHEMAS.items())
PARSE = {'type': 'object', 'required': ['params'], 'additionalProperties': False,
         'properties': {'params': {'$ref': 'https://locaction/contract/params.schema.json'}}}
NUMBER = re.compile(r'\d+(?:[.,]\d+)?')
THOUSANDS = re.compile(r'(\d)[\s\u00a0\u202f](?=\d{3}(?!\d))')  # 15 000 -> 15000, но 36, 38 не склеивается


def errors(kind: str, data) -> list[str]:
    schema = PARSE if kind == 'parse' else SCHEMAS[kind]
    validator = Draft202012Validator(schema, registry=REGISTRY, format_checker=Draft202012Validator.FORMAT_CHECKER)
    found = [f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}" for e in validator.iter_errors(data)]
    if kind == 'card':
        found += card_rules(data)
    return found


def card_rules(card: dict) -> list[str]:
    """Правила, которые не выразить схемой."""
    out = []
    forecast = card.get('forecast', {})
    if (forecast.get('status') == 'validated') != (forecast.get('probability') is not None):
        out.append('forecast: probability задаётся тогда и только тогда, когда status = validated')
    if forecast.get('interval') and not forecast['interval']['low'] <= (forecast.get('probability') or 0) <= forecast['interval']['high']:
        out.append('forecast: probability вне interval')
    if card.get('params', {}).get('category_id') is None:
        out.append('params.category_id: для карточки категория обязательна')
    ids = {i['id'] for i in card.get('place', {}).get('indicators', [])}
    out += [f'forecast.drivers: нет показателя {d["indicator_id"]}' for d in forecast.get('drivers', []) if d['indicator_id'] not in ids]
    return out


def card_numbers(card) -> set[str]:
    """Все числа карточки в тех видах, в каких LLM может их написать: 0.84 -> 0.84, 84; 9400 -> 9400."""
    found = set()
    def walk(value):
        if isinstance(value, bool):
            return
        if isinstance(value, (int, float)):
            found.add(f'{value:g}')
            if 0 < value < 1:
                found.add(f'{round(value * 100):g}')
        elif isinstance(value, str):
            found.update(f"{float(n.replace(',', '.')):g}" for n in NUMBER.findall(THOUSANDS.sub(r'\1', value)))
        elif isinstance(value, dict):
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)
    walk(card)
    return found


def unknown_numbers(explain: dict, card: dict) -> list[str]:
    known = card_numbers(card)
    texts = [item['text'] for key in ('strengths', 'weaknesses', 'checks') for item in explain[key]]
    seen = [n.replace(',', '.') for text in texts for n in NUMBER.findall(THOUSANDS.sub(r'\1', text))]
    return sorted({n for n in seen if f'{float(n):g}' not in known})


def main(argv: list[str]) -> int:
    if len(argv) == 2:
        checks = [(argv[0], Path(argv[1]))]
    else:
        ex = ROOT / 'examples'
        checks = [('card', ex / 'card-validated.json'), ('card', ex / 'card-not-validated.json'),
                  ('parse', ex / 'parse-response.json'), ('explain', ex / 'explain-response.json')]
    failed = 0
    for kind, path in checks:
        data = json.loads(path.read_text(encoding='utf-8'))
        problems = errors(kind, data)
        if kind == 'explain' and len(argv) != 2:
            card = json.loads((ROOT / 'examples' / 'card-validated.json').read_text(encoding='utf-8'))
            problems += [f'explain: числа не из карточки: {", ".join(extra)}' for extra in [unknown_numbers(data, card)] if extra]
        print(f'{"OK  " if not problems else "FAIL"} {kind:8} {path.name}')
        for problem in problems:
            print('     -', problem)
        failed += bool(problems)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
