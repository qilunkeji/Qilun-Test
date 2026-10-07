"""Read all supplied data PDFs and compare generic copy with the source library.

No PDF, identity, score or answer is published. This is a copy-presence audit,
not proof that rounded plots uniquely recover the old scoring version.
"""
import hashlib
import json
import re
import sys
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT / 'packages/assessment-engine/data/gh-report-text-v1.json').read_text())
paths = sorted((ROOT / '资料/人才报告').glob('*数据报告*.pdf'))
paths += [Path(p) for p in sys.argv[1:]]
clean = lambda text: re.sub(r'\s+', '', text or '').rstrip('。')
checks = []
for path in paths:
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    with pdfplumber.open(path) as document:
        assert len(document.pages) == 1
        page = document.pages[0]
        text = clean(page.extract_text())
        found = {
            'motivation': [r['id'] for r in CFG['results'] if r['type'] == 4 and len(clean(r['text'])) > 8 and clean(r['text']) in text],
            'strengths': [r['item'] for r in CFG['items'] if r['type'] == 2 and r['parent'] and clean(r['text']) in text],
            'values': [r['item'] for r in CFG['items'] if r['type'] == 5 and clean(r['text']) in text],
            'roles': [r['item'] for r in CFG['items'] if r['type'] == 28 and clean(r['text']) in text],
            'temperament': [r['code'] for r in CFG['results'] if r['type'] == 3 and r['code'] in ['SP', 'SJ', 'NT', 'NF'] and clean(r['temperament_name']) in text],
        }
        checks.append({'private_source': str(path), 'sha256': before, 'dimensions': [page.width, page.height], 'matched_dictionary_entries': found})
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before
output = ROOT / '.local/gh-report-text/pdf-copy-audit.json'
output.write_text(json.dumps(checks, ensure_ascii=False, indent=2) + '\n')
# The newly supplied report must show the five exact motives, six short
# strengths, three values and both role job strings already tested separately.
if sys.argv[1:]:
    last = checks[-1]['matched_dictionary_entries']
    assert set(last['motivation']) == {74, 1, 80, 79, 86}, last['motivation']
    assert len(last['strengths']) == 6 and len(last['values']) == 3 and len(last['roles']) == 2
    assert last['temperament'] == ['NF']
print(json.dumps({'status': 'PASS', 'data_pdfs_read': len(checks),
                  'matched_generic_phrases': {k: sum(len(c['matched_dictionary_entries'][k]) for c in checks) for k in checks[0]['matched_dictionary_entries']},
                  'originals_unchanged': True, 'new_pdf_short_copy_verified': bool(sys.argv[1:])}, ensure_ascii=False))
