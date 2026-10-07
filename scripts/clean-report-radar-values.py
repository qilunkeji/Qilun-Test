"""Remove residual sample numeric glyphs from the two public blank radar areas.

Only derived SVG templates are changed. No source PDF or private vector is opened.
The same coordinates are maintained in build-original-report-layouts.py.
"""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ET.register_namespace('', 'http://www.w3.org/2000/svg')
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
IDENTITY = (1, 0, 0, 1, 0, 0)

def mul(p, q):
    a,b,c,d,e,f = p
    g,h,i,j,k,l = q
    return a*g+c*h, b*g+d*h, a*i+c*j, b*i+d*j, a*k+c*l+e, b*k+d*l+f

for name, box in [('data', (785,260,1004,414)), ('talent-04', (527,273,698,443))]:
    path = ROOT / f'apps/admin-web/public/report-layout/{name}.svg'
    root = ET.fromstring(path.read_bytes())
    removed = []
    def walk(parent, transform):
        for el in list(parent):
            value = el.get('transform')
            matrix = tuple(map(float, re.findall(r'[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?', value))) if value else IDENTITY
            assert len(matrix) == 6
            m = mul(transform, matrix)
            x,y = m[0]*.3+m[2]*.4+m[4], m[1]*.3+m[3]*.4+m[5]
            if el.get('data-text') in tuple('0123456789.%') and box[0] <= x <= box[2] and box[1] <= y <= box[3]:
                parent.remove(el)
                removed.append(el.get('data-text'))
            elif not el.tag.endswith('defs'):
                walk(el, m)
    walk(root, IDENTITY)
    if removed:
        path.write_text(ET.tostring(root, encoding='unicode'), encoding='utf-8')
    print(f'{name}: {len(removed)} residual numeric glyphs removed')
