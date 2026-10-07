import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import manifest from '../apps/admin-web/public/report-layout/manifest.json' with {type:'json'};
import {reportHeaderBranding,reportCoverBranding,reportFooterContactMask,reportFooterBranding,reportBodyBranding} from '../apps/admin-web/src/report-branding.ts';

test('单页数据报告换齐论Logo并去二维码，不遮挡姓名/页眉分隔线',async()=>{
 const patch=reportHeaderBranding('data')!;
 assert.equal(patch.logo.src,'/brand/qilun-logo-light.png');
 await readFile(resolve('apps/admin-web/public'+patch.logo.src));
 for(const [box,original] of [[patch.logo,{x:62,y:64,width:80,height:80}],[patch.hiddenQr!,{x:1089,y:67,width:73,height:72}]]){
  assert.ok(box.x<=original.x&&box.y<=original.y);
  assert.ok(box.x+box.width>=original.x+original.width&&box.y+box.height>=original.y+original.height);
  assert.ok(box.y+box.height<160);
 }
 assert.ok(patch.logo.x+patch.logo.width<193);
 assert.equal(reportHeaderBranding('unknown'),undefined);
});

test('十页人才报告统一齐论标识，覆盖旧机构名称且不遮挡页码',async()=>{
 assert.equal(reportCoverBranding.title.text,'齐论AI内部人才测评报告');
 for(const page of manifest.pages){
  const header=reportHeaderBranding(page.id)!,contact=reportFooterContactMask(page.id)!,footer=reportFooterBranding(page.id)!;
  assert.equal(header.logo.src,'/brand/qilun-logo-light.png');
  assert.ok(contact.x+contact.width<615&&footer.x>665);
  for(const box of [header.logo,contact,footer])assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=page.width&&box.y+box.height<=page.height);
  const svg=await readFile(resolve('apps/admin-web/public'+page.src),'utf8');
  const glyphs=[...svg.matchAll(/<use\b[^>]*data-text="([^"]*)"[^>]*>/g)];
  const zones=[footer,...reportBodyBranding(page.id,false),...(page.id==='talent-01'?[reportCoverBranding.title]:[])];
  for(let i=0;i<glyphs.length-1;i++)if(glyphs[i][1]==='高'&&glyphs[i+1][1]==='禾'){
   const numbers=glyphs[i][0].match(/transform="matrix\(([^)]*)\)/)![1].split(',').map(Number);
   const x=numbers[4]+numbers[0]*.5,y=numbers[5]-numbers[0]*.4;
   assert.ok(zones.some(b=>x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height),page.id+' old name is not covered');
  }
 }
 assert.equal(reportBodyBranding('talent-03',false).length,1);
 assert.equal(reportBodyBranding('talent-03',true).length,2);
});

test('原版报告保留一页总览及十页原稿尺寸，手填位置不越页',()=>{
 assert.equal(manifest.pages.length,11);
 assert.equal(new Set(manifest.pages.map(p=>p.id)).size,11);
 assert.deepEqual(manifest.pages.map(p=>[p.width,p.height]),[[1224,1613],...Array.from({length:10},()=>[1224,1545])]);
 for(const p of manifest.pages)for(const slot of p.slots){
  assert.ok(slot.x>=0&&slot.y>=0&&slot.width>0&&slot.height>0);
  assert.ok(slot.x+slot.width<=p.width&&slot.y+slot.height<=p.height);
 }
});
test('分发资源仅含留白模板：无原样例身份、无外部图片依赖、无缺失矢量引用',async()=>{
 for(const page of manifest.pages){
  const svg=await readFile(resolve('apps/admin-web/public'+page.src),'utf8');
  const text=[...svg.matchAll(/data-text="([^"]*)"/g)].map(m=>m[1]).join('');
  for(const token of ['月月','1994.12.03','153****7697','2025.06.23','40分22秒'])assert.ok(!text.includes(token),page.id+' identity '+token);
  assert.ok(!svg.includes('.local/'));assert.ok(!/href="https?:/.test(svg));
  assert.match(svg,/data:image\//,page.id+' original static artwork is embedded');
  const ids=new Set([...svg.matchAll(/ id="([^"]+)"/g)].map(m=>m[1]));
  for(const ref of svg.matchAll(/(?:href="#|url\(#)([^"\)]+)/g))assert.ok(ids.has(ref[1]),page.id+' missing vector '+ref[1]);
 }
});
test('嵌入计算结果的报告打印隔离其他作答、表格与公式区域，保留当前报告',async()=>{
 const css=await readFile(resolve('apps/admin-web/src/original-report.css'),'utf8');
 const print=css.slice(css.indexOf('@media print'));
 assert.match(print,/\.replica-workspace>:not\(\.gh-replay-result\)/);
 assert.match(print,/\.gh-replay-result>:not\(\.original-studio\)\{display:none!important\}/);
 assert.match(print,/\.original-sheet\[data-document=data\]\{page:originalData\}/);
 assert.doesNotMatch(print,/\.original-studio\{display:none/);
});
