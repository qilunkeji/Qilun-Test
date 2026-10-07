import {readFile,writeFile} from 'node:fs/promises';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';
const manifest=JSON.parse(await readFile('.local/report-analysis/manifest.json','utf8'));
for(const ref of ['R03','R05','R07','R09','R11']){
 const entry=manifest.find(x=>x.ref===ref);
 const task=getDocument({data:new Uint8Array(await readFile(`资料/人才报告/${entry.name}`)),isEvalSupported:false,useSystemFonts:true});
 const doc=await task.promise,page=await doc.getPage(7),viewport=page.getViewport({scale:1.3}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
 await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
 await writeFile(`.local/report-analysis/${ref}-page7.png`,canvas.toBuffer('image/png'));await task.destroy();
}
console.log('Rendered five motivation pages locally; no upload or business import.');
