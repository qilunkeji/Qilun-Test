"""Read-only validation of the 20260928 supply; import only non-personal question text.
Usage: python3 scripts/import-question-supply.py <extracted supply root>
Does not run the supplied verifier (it rewrites its SHA manifest).
"""
import csv
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

root = Path(sys.argv[1]).resolve()
project = Path(__file__).resolve().parents[1]
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = root / 'SHA256SUMS.txt'
manifest_before = digest(manifest)
verified = 0
for line in manifest.read_text().splitlines():
    expected, name = line.split('  ', 1)
    path = (root / name).resolve()
    assert path.is_relative_to(root) and path.is_file()
    assert digest(path) == expected, name
    verified += 1

sources = {}
def rows(name):
    p = root / '原始证据' / name
    sources[name] = digest(p)
    return list(csv.DictReader(p.open(encoding='utf-8-sig', newline='')))

q = rows('20260918-assessment-question-bank.csv')
a = rows('20260918-controlled-assessment-answers.csv')
h = rows('20260922-historical-vId-answer-reconstruction.csv')
assert len(q) == len(a) == len(h) == 277
byq, bya, byh = ({r['eqid']: r for r in data} for data in [q, a, h])
assert len(byq) == len(bya) == len(byh) == 277 and byq.keys() == bya.keys() == byh.keys()
for item in q:
    for source, mapping in [(bya[item['eqid']], [('module','moduleName'),('answertype','answertype'),('title','stem'),('tag','optionA'),('totag','optionB')]), (byh[item['eqid']], [('module','所属模块'),('title','题面标题'),('tag','题面A'),('totag','题面B')])]:
        assert all(item[left] == source[right] for left, right in mapping)
assert Counter(r['module'] for r in q) == {'职业定位':64,'职业优势':153,'职业风格':28,'职业动机':32}
assert Counter(r['answertype'] for r in q) == {'5':213,'6':64}
old = json.loads((project/'packages/assessment-engine/data/strength-v3.json').read_text())['targetQuestions']
assert all(byq[r['id']]['tag'] == r['a'] and byq[r['id']]['totag'] == r['b'] for r in old)
probes = {}
for name in ['20260922-historical-questionlist-vid-probe.json','20260922-historical-value-questionlist-vId-probe.json']:
    p = root / '原始证据' / name
    sources[name] = digest(p)
    items = json.loads(p.read_text())['rows']
    probes[name] = {'requests':len(items), 'returned_etids':dict(Counter(str(r['body'].get('etid')) for r in items)), 'requested_etids':dict(Counter(str(r['form'].get('etid')) for r in items))}
assert digest(manifest) == manifest_before
summary = {
    'verified_files':verified, 'question_count':277, 'pair_count':213, 'statement_count':64,
    'controlled_rows':277, 'historical_rows':277,
    'same_answer_codes':sum(bya[k]['submittedCode'] == byh[k]['answerCode'] for k in byq),
    'statement_code_conflict':'本包单陈述记录将code=5标注完全符合；旧前端说明的完全符合编码为1。尚未确认是否为版本差异或记录标注错误。',
    'readme_count_error':'README写五档181/陈述96，与原始CSV的213/64不一致；采用逐行核验后的CSV计数。',
    'probe_summary':probes,
    'report_pair_available':False, 'scoring_key_available':False,
}
result = {'version':'supply-20260928', 'sources':sources, 'summary':summary,
          'modules':[{'name':m,'count':sum(r['module']==m for r in q),'pair_count':sum(r['module']==m and r['answertype']=='5' for r in q),'statement_count':sum(r['module']==m and r['answertype']=='6' for r in q)} for m in ['职业定位','职业风格','职业动机','职业优势']],
          'questions':[{'order':i+1,'id':r['eqid'],'module':r['module'],'page':int(r['page']),'order_in_page':int(r['order_in_page']),'answer_type':int(r['answertype']),'title':r['title'],'a':r['tag'],'b':r['totag']} for i,r in enumerate(q)]}
(project/'packages/assessment-engine/data/question-bank-277.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
