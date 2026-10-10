import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';
import {ghInvitePackage,emptyGhValues} from '../packages/assessment-engine/gh-invite.ts';
import {qilunStandardInvitePackage,scoreGhInvite} from '../packages/assessment-engine/gh-invite.ts';
import {loadAssessmentRuntime} from '../apps/api/assessment-product.ts';

test('H5实际HTML：正式欢迎页、前台Part与题号、横排五选项及恢复位置；普通后台无原理模板',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
 try{
  const {GhH5App}=await server.ssrLoadModule('/src/gh-h5-quiz.tsx');
  const initial={id:'fictional',name:'虚**',package:ghInvitePackage(),purpose:'虚构测评验收',expires_at:'2099-01-01T00:00:00Z',answers:{},value_draft:emptyGhValues(),revision:0,consented:false,submitted:false,report:null,submitted_at:null};
  const render=(r:object)=>renderToStaticMarkup(React.createElement(GhH5App,{token:'fictional-token-not-a-real-invite',pin:'123456',initial:r}));
  const welcome=render(initial);assert.match(welcome,/性格与发展测评/);assert.match(welcome,/预留约30分钟/);assert.match(welcome,/认真对待每一道题/);assert.match(welcome,/参与须知与数据说明/);assert.doesNotMatch(welcome,/277|非原版|还原|原版全同|价值观选择/);
  const quiz=render({...initial,consented:true,ui_progress:{phase:'questions',page:2,group:0}});assert.match(quiz,/Part A/);assert.match(quiz,/第 7 题/);assert.match(quiz,/h5-dot-options/);assert.equal((quiz.match(/type="radio"/g)??[]).length,15);assert.doesNotMatch(quiz,/职业定位|职业风格|职业动机|价值观选择与排序|普通题/);
  const partB=render({...initial,consented:true,ui_progress:{phase:'groups',page:22,group:2}});assert.match(partB,/Part B/);assert.match(partB,/第 3 组/);assert.doesNotMatch(partB,/价值观选择与排序/);
  const css=await readFile(new URL('../apps/admin-web/src/h5-reference.css',import.meta.url),'utf8');assert.match(css,/\.h5-dot-options\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);assert.doesNotMatch(css,/\.h5-dot-options\{grid-template-columns:1fr/);
  // Shared PIN/welcome/quiz header: official logo, natural aspect ratio and
  // no divider. Qualified selectors override the older reference-page rules.
  assert.match(welcome,/src="\/brand\/qilun-logo-light\.png" alt="齐论AI"/);
  const premium=await readFile(new URL('../apps/admin-web/src/premium.css',import.meta.url),'utf8');
  assert.match(premium,/\.h5-shell \.h5-brand\{[^}]*background:#fff/);
  assert.match(premium,/\.h5-shell \.h5-brand img\{[^}]*height:auto/);assert.doesNotMatch(premium,/mix-blend-mode:multiply/);
  assert.match(premium,/\.h5-shell \.h5-brand span\{[^}]*padding:0;border:0/);
  assert.match(premium,/\.h5-shell \.h5-brand img\{width:114px\}/);
  const {AssessmentCenter}=await server.ssrLoadModule('/src/assessment-center.tsx'),{AssessmentAdmin}=await server.ssrLoadModule('/src/assessment-admin.tsx');
  for(const role of ['hr','talent_lead']){const daily=renderToStaticMarkup(React.createElement(AssessmentCenter,{role}));assert.match(daily,/发起测评/);assert.match(daily,/测评报告/);assert.doesNotMatch(daily,/规则核验|版式与留白/);}
  for(const role of ['hr','ops','interviewer'])assert.doesNotMatch(renderToStaticMarkup(React.createElement(AssessmentAdmin,{role})),/规则核验|版式与留白/);
  assert.match(renderToStaticMarkup(React.createElement(AssessmentAdmin,{role:'talent_lead'})),/版式与留白/);
  assert.match(renderToStaticMarkup(React.createElement(AssessmentAdmin,{role:'talent_lead'})),/成品规则 · V1.0/);
 }finally{await server.close();}
});
test('成品版真实HTML：统一齐论口径、七模块及28能力，不展示原版核验统计；旧版仍保持原说明',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
 try{
  const runtime=loadAssessmentRuntime().standard;assert.ok(runtime);
  const pkg=qilunStandardInvitePackage(runtime),answers=Object.fromEntries(pkg.questions.map(q=>[q.id,3])),selected=pkg.value_groups.map(g=>g.slice(0,5)),v={selected,ranked:selected.flat().slice(0,10)},report=scoreGhInvite(pkg,answers,v,runtime.model,runtime);
  const {ReferenceReportView}=await server.ssrLoadModule('/src/h5-reference.tsx');
  const html=renderToStaticMarkup(React.createElement(ReferenceReportView,{report,name:'【虚构】成品验收'}));
  assert.doesNotMatch(html,/齐论测评 V1.0/);assert.match(html,/固定模型推算的参考评分/);assert.equal((html.match(/class="h5-result-section"/g)??[]).length,7);assert.ok('abilities' in report.result);for(const a of report.result.abilities)assert.ok(html.includes(a.name));
  assert.doesNotMatch(html,/原版|历史结果反推|反推估计|补出|能力保持留白|独立样本|平均误差|AgType8Map|32词|无规则/);
  const center=await readFile(new URL('../apps/admin-web/src/public-entry.tsx',import.meta.url),'utf8');assert.doesNotMatch(center,/setEstimate|estimate_abilities:|补出28项|value=\{packageKind\}/);assert.match(center,/完整七模块画像，包含28项能力参考评分/);
 }finally{await server.close();}
});
test('答题左右对照只改呈现：AB、五档编码/原选项标签及单陈述完整内容保留',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
 try{
  const {GhAnswerQuestion}=await server.ssrLoadModule('/src/gh-answer-question.tsx'),pkg=ghInvitePackage(),q=pkg.questions.find(q=>q.answer_type===5)!;
  const render=(question:typeof q,value?:number,disabled=false)=>renderToStaticMarkup(React.createElement(GhAnswerQuestion,{question,choices:pkg.choices,value,disabled,onSelect:()=>{}}));
  for(let value=1;value<=5;value++){
   const html=render(q,value);assert.match(html,/h5-statements-paired/);assert.ok(html.indexOf('h5-statement-a')<html.indexOf('h5-statement-b'));
   assert.equal((html.match(/type="radio"/g)??[]).length,5);assert.equal((html.match(/checked=""/g)??[]).length,1);assert.match(html,new RegExp(`<span class="h5-choice-dot" aria-hidden="true">${value}</span>`));
   for(const label of pkg.choices.paired)assert.ok(html.includes(`aria-label="${label}"`));
   assert.equal((html.match(/is-preferred/g)??[]).length,value===3?0:1);assert.match(html,/已选择/);
  }
  const single=pkg.questions.find(q=>q.answer_type!==5)!,html=render(single,undefined,true);assert.match(html,/fieldset disabled=""/);assert.match(html,/h5-statements-single/);assert.doesNotMatch(html,/h5-statement-[ab]|is-preferred|checked=""|已选择/);
  for(const label of pkg.choices.single)assert.ok(html.includes(`aria-label="${label}"`));
  const long='这是虚构的较长描述，请按照真实想法选择。'.repeat(30);assert.ok(render({...q,a:long}).includes(long));
 }finally{await server.close();}
});
test('齐论答题样式边界：两栏不折回纵向、品牌光带仅页头、44px圆点和清晰聚焦',async()=>{
 const css=await readFile(new URL('../apps/admin-web/src/h5-answer-design.css',import.meta.url),'utf8');
 assert.match(css,/\.h5-quiz \.h5-statements-paired\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.doesNotMatch(css,/h5-statements-paired\{grid-template-columns:(1fr|minmax\(0,1fr\))/);
 assert.match(css,/h5-quiz-heading:after\{[^}]*qilun-ribbon-dark\.jpg/);assert.doesNotMatch(css,/h5-statement[^{}]*\{[^}]*url\(/);
 assert.match(css,/\.h5-quiz \.h5-choice-dot\{width:44px;height:44px/);assert.match(css,/input:focus-visible\+\.h5-choice-dot\{outline:2px solid var\(--primary\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/\.h5-quiz \.h5-statement>span\{[^}]*overflow-wrap:anywhere/);
 assert.doesNotMatch(css,/\.original-|\.gh-report|\.h5-result-/);
});
