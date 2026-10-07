"""Extract original PDF vectors into isolated web report templates.

Usage: python3 scripts/build-original-report-layouts.py <data.pdf> <talent.pdf>
Requires PyMuPDF and fontTools. Originals are opened read-only, never overwritten.
Recorded sample SVGs remain private in .local; public blank SVGs physically remove
personal results, not CSS-hide them. No scoring is performed or inferred here.
"""
import hashlib
import copy
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
import pymupdf as fitz
from fontTools.svgLib.path import parse_path
from fontTools.pens.boundsPen import BoundsPen

ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/'apps/admin-web/public/report-layout'
PRIVATE=ROOT/'.local/original-report-sources'
PUBLIC.mkdir(parents=True,exist_ok=True)
PRIVATE.mkdir(parents=True,exist_ok=True)
(PUBLIC/'assets').mkdir(exist_ok=True)

# Source PDF points, not approximate browser-grid coordinates. Result fields
# remain separate from static headings, descriptions, legends and background art.
specs={
 'data':{'title':'数据报告 · 七模块总览','text':[(180,430,575,474),(105,700,586,793),(750,700,1130,816),(103,1448,590,1494),(736,1235,1120,1449),(105,1502,1070,1525),(258,828,749,852)],'charts':[(135,213,556,374),(146,533,562,674),(689,533,1098,674),(134,866,1075,1095),(135,1235,574,1409)],'graphics':[(1090,60,1160,140),(286,75,310,98),(875,119,946,141),(777,1190,860,1218),(689,438,1100,472)],'numbers':[(785,260,940,374)],'slots':[['style.type',180,430,360,22],['style.temperament',180,453,360,22],['values.interpretation',108,700,465,84],['motivation.interpretation',750,701,360,110],['roles.interpretation',135,1448,440,45],['strengths.summary',750,1237,360,205]],'radar':[(783,268,951,414)]},
 'talent-01':{'title':'封面','text':[(180,860,275,896),(805,860,985,896),(805,918,985,955),(220,975,392,1015),(805,975,985,1015)],'graphics':[(272,925,351,958),(358,1046,450,1074)],'slots':[['person.name',181,860,150,35],['person.birth_date',811,860,225,35],['person.phone',811,918,250,35],['assessment.date',230,975,230,35],['assessment.duration',811,975,220,35]]},
 'talent-02':{'title':'目录','text':[]},
 'talent-03':{'title':'概要与测评情况','text':[(485,1188,600,1213),(766,1188,914,1213),(380,1360,1115,1425)],'graphics':[(532,1330,595,1349)],'slots':[['assessment.started_at',492,1190,130,24],['assessment.ended_at',772,1190,130,24],['quality.interpretation',387,1360,690,66]]},
 'talent-04':{'title':'元五人格','text':[(138,575,1095,606),(250,877,316,907),(346,1023,1050,1048),(140,1181,1115,1211),(107,1235,1118,1420)],'graphics':[(616,947,655,991)],'numbers':[(548,282,662,398)],'radar':[(548,309,662,399)],'slots':[['big_five.interpretation',139,575,957,30],['big_five.emotion_text',347,1023,700,28],['traits.introduction',145,1181,960,30],['traits.table',108,1235,1010,185]]},
 'talent-05':{'title':'职业角色','text':[(127,720,584,1085),(645,720,1105,1085),(150,1321,586,1400),(670,1340,1105,1401)],'charts':[(220,277,1070,511)],'slots':[['roles.primary',128,720,451,350],['roles.secondary',646,720,451,350],['roles.preferred_jobs',151,1321,433,76],['roles.avoided_jobs',672,1340,430,61]]},
 'talent-06':{'title':'职业能力','text':[(170,730,1100,788),(195,892,710,1170),(195,1197,710,1338),(779,910,1110,965),(779,1038,1110,1095),(779,1168,1110,1224),(779,1298,1110,1353)],'charts':[(215,242,1075,520)],'slots':[['abilities.overview',172,730,928,60],['abilities.top_six',199,892,500,279],['abilities.bottom_three',199,1197,500,141],['abilities.layers',783,910,320,445]]},
 'talent-07':{'title':'职业动机','text':[(255,576,1110,749),(256,775,1110,984),(120,1100,601,1182),(633,1134,1110,1220)],'charts':[(194,254,1047,433)],'graphics':[(529,1078,560,1098),(980,1059,1037,1097)],'slots':[['motivation.top_bottom',258,577,850,170],['motivation.explanations',258,775,845,210],['motivation.tendency',122,1100,477,83],['motivation.driver',637,1134,471,86]]},
 'talent-08':{'title':'职业价值观与才干棋盘','text':[(138,556,1108,589),(165,607,1110,748),(414,886,780,1140),(234,1268,1121,1440)],'charts':[(246,277,1000,481)],'graphics':[(513,914,705,1095),(198,1109,300,1132)],'slots':[['values.summary',140,556,960,35],['values.anchors',167,607,940,141],['strengths.board',233,1268,889,172]]},
 'talent-09':{'title':'才干排序与职业风格','text':[(137,230,1114,402),(185,925,750,963),(185,1010,800,1050),(139,1180,1118,1290),(300,580,1040,790)],'charts':[(300,583,910,790)],'slots':[['strengths.top_bottom',138,230,974,172],['style.temperament',190,929,700,31],['style.type',190,1016,700,31],['style.interpretation',142,1180,970,111]]},
 'talent-10':{'title':'TA的综合建议','text':[(123,330,1110,548),(123,640,1110,827),(123,918,1110,1025)],'slots':[['advice.management',127,330,980,220],['advice.roles',127,640,980,190],['advice.environment',127,918,980,110]]},
}

palette=['#ed8a8a','#e2b4b3','#6ac36c','#b3d9ad','#73a0fb','#b0c6f9','#f7c739','#f6dd9a']
# Exact source coordinates verified against PDF text spans.
specs['data']['text'][2]=(729,700,1130,816)
specs['data']['text'].remove((258,828,749,852))
specs['data']['numbers'].append((247,828,749,852))
specs['data']['numbers'][0]=(785,260,1004,414)
specs['talent-04']['numbers']=[(527,273,698,443)]
specs['data']['slots'][3]=['motivation.interpretation',730,701,390,110]
specs['data']['slots'] += [
 ['person.name',249,73,120,24],['person.phone',558,73,155,24],
 ['person.birth_date',887,73,170,24],['assessment.date',256,119,180,24],
 ['assessment.duration',572,119,160,24]]
specs['data']['graphics'][2]=(875,119,903,141)
specs['data']['graphics'][3]=(749,1190,860,1218)
specs['data']['neutral_text']=[(903,119,950,142)]
specs['data']['neutral_controls']=[((837.5,130.5),(890.5,130.5))]
specs['talent-01']['graphics']=[(288,929,315,956),(360,1045,387,1072)]
specs['talent-01']['neutral_text']=[(319,927,356,963),(393,1043,451,1079)]
specs['talent-01']['neutral_controls']=[((202.5,942.5),(301.5,942.5)),((274.5,1058.5),(373.5,1058.5))]
specs['talent-03']['graphics']=[(532,1330,557,1349)]
specs['talent-03']['neutral_text']=[(558,1325,598,1350)]
specs['talent-03']['neutral_controls']=[((492,1338),(544,1338))]
specs['talent-04']['text'].remove((250,877,316,907))
specs['talent-04']['neutral_text']=[(235,877,312,907)]
specs['talent-06']['graphics']=[(199,919,350,1332)]
specs['talent-06']['clear_fills']=['#fbe8e8','#e3ecfe','#fdf4d7','#e3f8f0']
specs['talent-06']['fill_zones']=[(758,908,1117,1360)]
specs['talent-08']['text'].remove((234,1268,1121,1440))
specs['talent-08']['numbers']=[(234,1268,1121,1440)]
specs['talent-08']['neutral_text']=[(234,1268,1121,1440)]
specs['talent-08']['clear_color_fills']=[(234,1268,1121,1440)]
specs['talent-08']['graphics'][0]=(414,886,810,1107)
SVG='http://www.w3.org/2000/svg'
XLINK='http://www.w3.org/1999/xlink'
ET.register_namespace('',SVG)
ET.register_namespace('xlink',XLINK)
identity=(1,0,0,1,0,0)
def multiply(p,q):
    a,b,c,d,e,f=p;g,h,i,j,k,l=q
    return (a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f)
def matrix(value):
    if not value:return identity
    assert value.startswith('matrix('),value
    return tuple(float(x) for x in re.findall(r'[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?',value))
def point(m,x,y):return (m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5])
def in_zones(p,zones):return any(z[0]<=p[0]<=z[2] and z[1]<=p[1]<=z[3] for z in zones)
def path_center(el,m):
    pen=BoundsPen(None)
    parse_path(el.get('d',''),pen)
    if pen.bounds is None:return None
    x0,y0,x1,y1=pen.bounds
    return point(m,(x0+x1)/2,(y0+y1)/2)

def blank_svg(raw,spec):
    # Operate on source vector objects rather than PDF redaction (which can
    # discard clipped shading/image containers). This preserves exact artwork.
    tree=ET.fromstring(raw)
    parent={child:el for el in tree.iter() for child in el}
    glyphs=[el for el in tree.iter() if el.get('data-text') is not None]
    text=''.join(el.get('data-text','') for el in glyphs)
    remove=set()
    controls=[]
    offsets=[]
    for el in glyphs:offsets.extend([el]*len(el.get('data-text','')))
    for token in privacy_tokens:
        start=0
        while (at:=text.find(token,start))>=0:
            remove.update(offsets[at:at+len(token)]);start=at+len(token)
    defs=tree.find(f'{{{SVG}}}defs')
    images={el.get('id'):el for el in tree.iter(f'{{{SVG}}}image')}
    def walk(el,ancestor=identity):
        if el is defs:return
        m=multiply(ancestor,matrix(el.get('transform')))
        tag=el.tag.split('}')[-1]
        if el.get('data-text') is not None:
            # MuPDF glyph coordinates use a baseline and flipped local y-axis.
            center=point(m,.3,.4)
            char=el.get('data-text','')
            if in_zones(center,spec.get('text',[])) or (char in '0123456789.%' and in_zones(center,spec.get('charts',[])+spec.get('numbers',[]))) or in_zones(center,spec.get('graphics',[])):
                remove.add(el)
            elif in_zones(center,spec.get('neutral_text',[])):
                el.set('fill','#777777')
        elif tag=='path':
            center=path_center(el,m)
            for source_pos,target_pos in spec.get('neutral_controls',[]):
                if center and all(abs(center[i]-source_pos[i])<.01 for i in [0,1]) and el.get('fill')=='#c2c2c2':
                    clone=copy.deepcopy(el)
                    clone.set('transform','matrix('+','.join(map(str,(*m[:4],m[4]+target_pos[0]-source_pos[0],m[5]+target_pos[1]-source_pos[1])))+')')
                    controls.append(clone)
            fill=el.get('fill','');stroke=el.get('stroke','')
            colorful=any(re.fullmatch(r'#[0-9a-fA-F]{6}',c) and max(int(c[i:i+2],16) for i in [1,3,5])-min(int(c[i:i+2],16) for i in [1,3,5])>30 for c in [fill,stroke])
            tinted_fill=bool(re.fullmatch(r'#[0-9a-fA-F]{6}',fill)) and max(int(fill[i:i+2],16) for i in [1,3,5])-min(int(fill[i:i+2],16) for i in [1,3,5])>5
            actual_radar=fill.lower()=='#6ac36c' or stroke.lower()=='#6ac36c'
            if center and (in_zones(center,spec.get('graphics',[])) or (colorful and in_zones(center,spec.get('charts',[]))) or (actual_radar and in_zones(center,spec.get('radar',[])))):remove.add(el)
            if center and ((fill.lower() in spec.get('clear_fills',[]) and in_zones(center,spec.get('fill_zones',[]))) or (tinted_fill and in_zones(center,spec.get('clear_color_fills',[])))):remove.add(el)
        elif tag=='use':
            ref=el.get(f'{{{XLINK}}}href','').lstrip('#')
            if ref in images:
                im=images[ref];center=point(m,float(im.get('width','0'))/2,float(im.get('height','0'))/2)
                if in_zones(center,spec.get('graphics',[])+spec.get('charts',[])):remove.add(el)
        elif tag=='image':
            center=point(m,float(el.get('x','0'))+float(el.get('width','0'))/2,float(el.get('y','0'))+float(el.get('height','0'))/2)
            if in_zones(center,spec.get('graphics',[])+spec.get('charts',[])):remove.add(el)
        for child in list(el):walk(child,m)
    walk(tree)
    for el in remove:
        if el in parent and el in list(parent[el]):parent[el].remove(el)
    for el in controls:tree.append(el)
    assert len(controls)==len(spec.get('neutral_controls',[])), 'unchecked control template not found'
    # Remove unreachable definitions, but retain inline images inside referenced
    # alpha masks. An image with an id is not necessarily a <defs> declaration.
    def refs(el):
        found=set()
        for node in el.iter():
            for key,value in node.attrib.items():
                if key.endswith('href') and value.startswith('#'):found.add(value[1:])
                found.update(re.findall(r'url\(#([^)]*)\)',value))
        return found
    used=set().union(*(refs(el) for el in tree if el is not defs))
    if defs is not None:
        changed=True
        while changed:
            prior=len(used)
            for el in defs:
                if el.get('id') in used:used.update(refs(el))
            changed=len(used)!=prior
        for el in list(defs):
            if el.get('id') not in used:defs.remove(el)
    remaining=''.join(el.get('data-text','') for el in tree.iter())
    assert not any(token in remaining for token in privacy_tokens)
    return ET.tostring(tree,encoding='unicode')

manifest={'version':'original-pdf-layout-20260928','rendering':'Original vector geometry and glyph outlines; result slots cleared without guessing scores.','palette':palette,'pages':[]}
privacy_tokens=['月月','1994.12.03','153****7697','2025.06.23','40分22秒']
qa=[]
for kind,path in [('data',sys.argv[1]),('talent',sys.argv[2])]:
    original_hash=hashlib.sha256(Path(path).read_bytes()).hexdigest()
    source=fitz.open(path)
    for index,pg in enumerate(source):
        key='data' if kind=='data' else f'talent-{index+1:02}'
        spec=specs[key]
        # Recorded sample is a separate, private local artifact, never public/bundled.
        raw=pg.get_svg_image(text_as_path=True)
        (PRIVATE/f'{key}.svg').write_text(raw)
        # An SVG loaded via <img> cannot load nested external images. Keep source
        # logos and clipped gradient artwork embedded to preserve their rendering.
        svg=blank_svg(raw,spec)
        (PUBLIC/f'{key}.svg').write_text(svg)
        entry={'id':key,'document':kind,'page':index+1,'title':spec['title'],'width':pg.rect.width,'height':pg.rect.height,'src':f'/report-layout/{key}.svg','slots':[{'id':s[0],'x':s[1],'y':s[2],'width':s[3],'height':s[4]} for s in spec.get('slots',[])],'source_sha256':original_hash}
        manifest['pages'].append(entry)
        qa.append({'id':key,'private_tokens_remaining':0,'blank_svg_bytes':len(svg),'source_sha256':original_hash})
    source.close()
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==original_hash
(PUBLIC/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(PRIVATE/'layout-qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n')
# Recoverably retire generated assets from an earlier external-image strategy.
retired=PRIVATE/'unused-generated-assets'
for asset in (PUBLIC/'assets').iterdir():
    if asset.is_file():
        retired.mkdir(exist_ok=True)
        asset.replace(retired/asset.name)
print(json.dumps({'pages':len(qa),'cleared_identity_tokens':True,'originals_unchanged':True,'private_samples':str(PRIVATE)},ensure_ascii=False))
