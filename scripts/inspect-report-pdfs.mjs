// Local, read-only analysis of the explicitly supplied reports. Never uploads files.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const names=['黄非红的数据报告.pdf','黄非红的数据报告2.pdf','彤彤的人才报告.pdf','彤彤的数据报告.pdf','小简的人才报告.pdf','小简的数据报告.pdf','月月的人才报告.pdf','月月的数据报告.pdf','光月的人才报告.pdf','光月的数据报告.pdf','黄非红的人才报告3.pdf'];
const root='资料/人才报告';
await mkdir('.local/report-analysis',{recursive:true});
const manifest=[];
for(const [i,name] of names.entries()){
 const bytes=await readFile(`${root}/${name}`),sha256=createHash('sha256').update(bytes).digest('hex');
 const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true});
 const doc=await task.promise;
 const pages=[];
 for(let p=1;p<=doc.numPages;p++){
  const page=await doc.getPage(p),content=await page.getTextContent();
  const lines=[];let previousY;
  for(const item of content.items){if(!('str' in item))continue;const y=item.transform[5];if(previousY!==undefined&&Math.abs(y-previousY)>3)lines.push('\n');lines.push(item.str+' ');previousY=y;}
  pages.push({page:p,text:lines.join('').trim()});
 }
 const ref=`R${String(i+1).padStart(2,'0')}`;
 await writeFile(`.local/report-analysis/${ref}.json`,JSON.stringify({ref,name,sha256,pages},null,2));
 manifest.push({ref,name,sha256,pages:doc.numPages,characters:pages.reduce((s,p)=>s+p.text.length,0),duplicate_of:manifest.find(x=>x.sha256===sha256)?.ref??null});
 await task.destroy();
}
await writeFile('.local/report-analysis/manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest.map(({name,...rest})=>rest),null,2));
