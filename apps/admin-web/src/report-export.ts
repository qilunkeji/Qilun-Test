/** Snapshot the displayed sheet only; all assets stay same-origin and personal
 * data stays in this browser. Never send the report to a conversion service. */
export async function saveReportImage(sheet:HTMLElement,filename:string){
 const bounds=sheet.getBoundingClientRect();
 if(!bounds.width||!bounds.height)throw new Error('报告尚未显示，请稍后重试。');
 const copy=sheet.cloneNode(true) as HTMLElement;
 const originals=[sheet,...sheet.querySelectorAll('*')];
 const clones=[copy,...copy.querySelectorAll('*')];
 for(let i=0;i<originals.length;i++){
  const style=getComputedStyle(originals[i]);
  const target=clones[i] as HTMLElement|SVGElement;
  for(const key of style)target.style.setProperty(key,style.getPropertyValue(key));
 }
 copy.style.position='relative';copy.style.margin='0';copy.style.boxShadow='none';
 copy.style.width=`${bounds.width}px`;copy.style.height=`${bounds.height}px`;
 copy.querySelectorAll('.no-print').forEach(e=>e.remove());
 for(const img of copy.querySelectorAll('img')){
  const source=new URL(img.src,location.href);
  if(source.origin!==location.origin)throw new Error('报告包含非本站图片，无法安全导出。');
  const response=await fetch(source.href,{credentials:'same-origin'});
  if(!response.ok)throw new Error('报告图片加载失败，请刷新后重试。');
  img.src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('报告图片读取失败。'));response.blob().then(blob=>reader.readAsDataURL(blob)).catch(reject);});
 }
 copy.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(copy)}</foreignObject></svg>`;
 const image=new Image();
 const svgUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('报告转换失败。'));reader.readAsDataURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));});
 await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('浏览器暂不支持图片导出，请使用保存 PDF。'));image.src=svgUrl;});
 const scale=Math.min(2,8192/Math.max(bounds.width,bounds.height));
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(bounds.width*scale);canvas.height=Math.ceil(bounds.height*scale);
 const context=canvas.getContext('2d');if(!context)throw new Error('浏览器无法生成图片，请使用保存 PDF。');
 context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.scale(scale,scale);context.drawImage(image,0,0);
 const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片保存失败，请使用保存 PDF。')),'image/png'));
 const url=URL.createObjectURL(png),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
