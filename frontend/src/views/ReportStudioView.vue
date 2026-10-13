<script setup lang="ts">
// SVG 报告工作室 — Vue 3 port of original-report.tsx + gh-report-preview.tsx
// Renders the 11-page master SVG with computed field overlays, charts, and branding.
import { ref, computed, onMounted } from 'vue';
import { saveReportImage, reportExportName, printReport } from '../logic/report-export';
import { reportHeaderBranding, reportCoverBranding, reportFooterContactMask, reportFooterBranding, reportBodyBranding } from '../logic/report-branding';

type Slot = { id: string; x: number; y: number; width: number; height: number };
type Sheet = { id: string; document: string; page: number; title: string; width: number; height: number; src: string; slots: Slot[] };
type Manifest = { version: string; palette: string[]; pages: Sheet[] };
type Ability = { item: string; name: string; parent: string; value: number };
type ReportData = {
  result?: {
    abilities?: Ability[]; ability_summary?: { top_six: Ability[]; bottom_three: Ability[]; groups?: { item: string; name: string; value: number }[]; potential5?: Record<string, number> };
    style?: { code: string; name: string };
    values?: { item: string; name: string; raw: number; calibrated: number | null; report_value: number | null }[];
    motivation?: { item: string; name: string; raw: number; calibrated: number; report_value: number }[];
    roles?: { item: string; name: string; scoreTotalCalibrateSeniorNew?: number; [key: string]: unknown }[];
    rows?: { item: number | string; name: string; type: number; score: number }[];
    traits?: { children: { item: string; name: string; score: number }[]; parents: { item: number; score: number | null }[] };
    strengths?: { item: string; name: string; score: number; rank: number }[];
    report_text?: {
      temperament?: { code?: string; name: string; text: string };
      values?: { item: string; label: string; text: string }[];
      motivation?: { lines: { type: string; label: string; text?: string; name?: string }[] };
      roles?: { item: string; label: string; text: string }[];
      strengths?: { groups: { item: string; name: string; rows: { item: string; name: string; text: string; rank: number }[] }[]; bottom_six?: { name: string }[] };
    };
    grade?: { value: number };
  };
};

const props = defineProps<{ report: ReportData | null; personName?: string; submittedAt?: string | null }>();

const manifest = ref<Manifest | null>(null);
const currentSheet = ref('data');
const mode = ref<'blank' | 'computed'>(props.report ? 'computed' : 'blank');
const zoom = ref<'fit' | 'native'>('fit');
const saving = ref(false);
const exportError = ref('');
const sheetEl = ref<HTMLElement | null>(null);

onMounted(async () => {
  try {
    const res = await fetch('/report-layout/manifest.json');
    if (!res.ok) throw new Error('母版加载失败');
    manifest.value = await res.json();
  } catch (e) { exportError.value = (e as Error).message; }
});

const page = computed<Sheet | null>(() => {
  if (!manifest.value) return null;
  return manifest.value.pages.find(p => p.id === currentSheet.value) ?? manifest.value.pages[0];
});

const replay = computed(() => props.report?.result ?? null);
const hasAbilities = computed(() => !!replay.value?.abilities?.length);
const isStandard = computed(() => hasAbilities.value);

// Branding overlays
const branding = computed(() => page.value ? reportHeaderBranding(page.value.id) : undefined);
const cover = computed(() => page.value?.id === 'talent-01' ? reportCoverBranding : undefined);
const footerMask = computed(() => page.value ? reportFooterContactMask(page.value.id) : undefined);
const footerBrand = computed(() => page.value ? reportFooterBranding(page.value.id) : undefined);
const bodyBrand = computed(() => page.value ? reportBodyBranding(page.value.id, false) : []);

function pct(box: { x: number; y: number; width: number; height: number }, dims: { width: number; height: number }) {
  return {
    left: `${box.x / dims.width * 100}%`,
    top: `${box.y / dims.height * 100}%`,
    width: `${box.width / dims.width * 100}%`,
    height: `${box.height / dims.height * 100}%`,
  };
}

// Computed field values (ghReportFields port)
const computedFields = computed<Record<string, string>>(() => {
  const r = replay.value;
  if (!r || mode.value !== 'computed') return {};
  const fields: Record<string, string> = {};
  if (r.style) fields['style.type'] = `${r.style.code}（${r.style.name}）`;
  if (r.report_text?.temperament) fields['style.temperament'] = r.report_text.temperament.text;
  if (r.report_text?.values) fields['values.interpretation'] = r.report_text.values.map(v => `${v.label}：${v.text}`).join('\n');
  if (r.report_text?.motivation) fields['motivation.interpretation'] = r.report_text.motivation.lines.map(v => v.text).join('\n');
  if (r.report_text?.roles) fields['roles.interpretation'] = r.report_text.roles.map(v => `${v.label}：${v.text}`).join('\n');
  if (r.strengths) {
    fields['strengths.top_bottom'] = `前6项：${r.strengths.slice(0, 6).map(x => x.name).join('、')}\n最后6项：${r.strengths.slice(-6).map(x => x.name).join('、')}`;
  }
  if (r.report_text?.strengths) {
    const groups = r.report_text.strengths.groups.map(g => `${g.name}\n${g.rows.map(s => `${s.name}：${s.text}——第${s.rank}位`).join('\n')}`).join('\n');
    const bottom = r.report_text.strengths.bottom_six?.map(s => s.name).join('、') ?? '';
    fields['strengths.summary'] = `${groups}\n最后6项：${bottom}`;
  }
  if (r.traits?.children) fields['traits.table'] = r.traits.children.map(x => `${x.name} ${x.score}`).join('　');
  if (r.roles) {
    const sorted = [...r.roles].sort((a, b) => (b.scoreTotalCalibrateSeniorNew ?? 0) - (a.scoreTotalCalibrateSeniorNew ?? 0));
    if (sorted[0]) fields['roles.primary'] = `${sorted[0].name}：${Math.round((sorted[0].scoreTotalCalibrateSeniorNew ?? 0) * 100) / 100}`;
    if (sorted[1]) fields['roles.secondary'] = `${sorted[1].name}：${Math.round((sorted[1].scoreTotalCalibrateSeniorNew ?? 0) * 100) / 100}`;
  }
  if (r.motivation) fields['motivation.top_bottom'] = `当前动机图表值：\n${r.motivation.map(x => `${x.name} ${x.report_value}`).join('　')}`;
  if (r.values) {
    const sorted = [...r.values].filter(x => x.report_value !== null).sort((a, b) => (b.report_value ?? 0) - (a.report_value ?? 0)).slice(0, 3);
    fields['values.summary'] = sorted.map(x => `${x.name.replace(/型$/, '')} ${x.report_value}`).join('　');
  }
  if (r.abilities && r.ability_summary) {
    fields['abilities.overview'] = isStandard.value ? '依据齐论固定规则呈现能力画像，供自我理解与发展沟通参考；不等同于实际技能或绩效。' : '28项分数由历史结果反推估计，仅用于核验。';
    fields['abilities.top_six'] = r.ability_summary.top_six.map((a, i) => `${i + 1}. ${a.name}　${a.value}`).join('\n\n');
    fields['abilities.bottom_three'] = r.ability_summary.bottom_three.map(a => `${a.name}　${a.value}`).join('\n\n');
  }
  return fields;
});

// Chart data (GhReportPlots port — bar/radar coordinates)
const palette = ['#ed8a8a', '#e2b4b3', '#6ac36c', '#b3d9ad', '#73a0fb', '#b0c6f9', '#f7c739', '#f6dd9a'];
const chartData = computed(() => {
  const r = replay.value;
  if (!r || mode.value !== 'computed') return null;
  const style = (r.rows ?? []).filter(x => x.type === 3).sort((a, b) => (Number(a.item) || 0) - (Number(b.item) || 0)).map((x, i) => ({ value: x.score, color: palette[i] }));
  const values = [...(r.values ?? [])].filter(x => x.report_value !== null).sort((a, b) => (b.report_value ?? 0) - (a.report_value ?? 0)).map((x, i) => ({ value: x.report_value, color: palette[i], label: x.name.replace(/型$/, '') }));
  const motivation = ['财富', '健康', '享受', '工作', '权力', '创新', '情感', '荣誉'].map((name, i) => {
    const m = (r.motivation ?? []).find(x => x.name === name);
    return { value: m?.report_value ?? null, color: palette[i] };
  });
  const roles = [...(r.roles ?? [])].sort((a, b) => (b.scoreTotalCalibrateSeniorNew ?? 0) - (a.scoreTotalCalibrateSeniorNew ?? 0)).map((x, i) => ({ value: Math.round((x.scoreTotalCalibrateSeniorNew ?? 0) * 100) / 100, color: palette[i], label: x.name }));
  const bigFive = [242, 246, 245, 244, 243].map(id => Math.round((r.traits?.parents?.find(p => p.item === id)?.score ?? 0) * 100) / 100);
  const abilities = (r.abilities ?? []).map(a => ({ value: a.value, color: palette[0] }));
  return { style, values, motivation, roles, bigFive, abilities };
});

const exportName = computed(() => props.personName?.trim() || '');

async function exportPng() {
  if (!sheetEl.value) return;
  saving.value = true;
  exportError.value = '';
  try {
    await saveReportImage(sheetEl.value, `${reportExportName(exportName.value)}.png`);
  } catch (e) { exportError.value = (e as Error).message; } finally { saving.value = false; }
}
</script>

<template>
  <section v-if="manifest && page" class="report-studio" aria-label="原版报告版式">
    <div class="toolbar no-print">
      <div>
        <h3>{{ isStandard ? '齐论测评数据表' : '原版报告' }}</h3>
        <p>{{ isStandard ? '性格与发展数据总览' : '一页数据总览 · 十页人才报告' }}</p>
        <p v-if="exportError" role="alert" style="color:#9b0000">{{ exportError }}</p>
      </div>
      <div class="controls">
        <label>页面
          <select v-model="currentSheet" aria-label="报告页面">
            <optgroup label="数据报告"><option value="data">七模块数据总览</option></optgroup>
            <optgroup label="人才报告 · 10页">
              <option v-for="p in manifest.pages.filter(x => x.document === 'talent')" :key="p.id" :value="p.id">{{ p.page }}. {{ p.title }}</option>
            </optgroup>
          </select>
        </label>
        <label>比例
          <select v-model="zoom"><option value="fit">适合窗口</option><option value="native">原稿尺寸</option></select>
        </label>
        <button :disabled="saving" @click="exportPng" class="save-btn">{{ saving ? '生成中…' : '保存图片' }}</button>
        <button @click="printReport(exportName || undefined)">打印 / PDF</button>
      </div>
    </div>

    <div v-if="mode === 'computed' && hasAbilities" class="modebar no-print">
      <p>{{ isStandard ? '七模块短文案使用原字典与已知规则；28项能力为固定模型参考评分。' : '28项能力为反推估计，非原版实算。' }}</p>
    </div>

    <div :class="['scroll', zoom === 'native' ? 'native' : '']">
      <div ref="sheetEl" class="sheet" :style="{ maxWidth: `${page.width}px`, aspectRatio: `${page.width}/${page.height}` }">
        <img class="sheet-vector" :src="page.src" :alt="page.title" />
        <!-- Branding overlays -->
        <template v-if="branding">
          <div v-if="branding.logo" class="header-logo" :style="pct(branding.logo, page)"><img :src="branding.logo.src" :alt="branding.logo.alt" /></div>
          <div v-if="branding.hiddenQr" class="qr-removed" :style="pct(branding.hiddenQr, page)" aria-hidden="true" />
        </template>
        <div v-if="footerMask" class="brand-mask" :style="pct(footerMask, page)" aria-hidden="true" />
        <div v-if="footerBrand" class="footer-brand" :style="{ ...pct(footerBrand, page), fontSize: `${14 / page.width * 100}cqw` }">{{ footerBrand.text }}</div>
        <div v-for="(box, i) in bodyBrand" :key="i" class="body-brand" :style="{ ...pct(box, page), fontSize: `${16 / page.width * 100}cqw` }">{{ box.text }}</div>

        <!-- Chart overlays (computed mode) -->
        <svg v-if="chartData && mode === 'computed'" class="computed-plots" :viewBox="`0 0 ${page.width} ${page.height}`" aria-label="计算图表">
          <!-- data page: style bars, values bars, motivation bars, roles bars, radar, abilities bars -->
          <template v-if="page.id === 'data'">
            <!-- Style bars (8 items, paired) -->
            <g v-for="(bar, i) in chartData.style" :key="'s' + i">
              <rect v-if="bar.value !== null" :x="134 + (i + Math.floor(i / 2)) * (420 / 11) + (420 / 11) * 0.155" :y="213 + 160 - Math.max(0, Math.min(25, bar.value)) / 25 * 160" :width="(420 / 11) * 0.69" :height="Math.max(0, Math.min(25, bar.value)) / 25 * 160" :fill="bar.color" />
              <text v-if="bar.value !== null" :x="134 + (i + Math.floor(i / 2)) * (420 / 11) + (420 / 11) * 0.5" :y="213 + 160 - Math.max(0, Math.min(25, bar.value)) / 25 * 160 - 7" text-anchor="middle" font-size="12" fill="#555">{{ Math.round(bar.value * 100) / 100 }}</text>
            </g>
            <!-- Values bars -->
            <g v-for="(bar, i) in chartData.values" :key="'v' + i">
              <rect v-if="bar.value !== null" :x="144 + i * (417.2 / chartData.values.length)" :y="540 + 133 - Math.min(100, bar.value) / 100 * 133" :width="(417.2 / chartData.values.length) * 0.69" :height="Math.min(100, bar.value) / 100 * 133" :fill="bar.color" />
              <text v-if="bar.value !== null" :x="144 + i * (417.2 / chartData.values.length) + (417.2 / chartData.values.length) * 0.345" :y="540 + 133 - Math.min(100, bar.value) / 100 * 133 - 7" text-anchor="middle" font-size="12" fill="#555">{{ bar.value }}</text>
            </g>
            <!-- Values axis labels -->
            <text v-for="(bar, i) in chartData.values" :key="'vl' + i" :x="144 + (i + 0.5) * (417.2 / chartData.values.length)" :y="692" text-anchor="middle" font-size="12" fill="#555">{{ bar.label }}</text>
            <!-- Motivation bars -->
            <g v-for="(bar, i) in chartData.motivation" :key="'m' + i">
              <rect v-if="bar.value !== null" :x="684 + i * (411 / chartData.motivation.length)" :y="540 + 133 - Math.min(100, bar.value) / 100 * 133" :width="(411 / chartData.motivation.length) * 0.69" :height="Math.min(100, bar.value) / 100 * 133" :fill="bar.color" />
            </g>
            <!-- Roles bars -->
            <g v-for="(bar, i) in chartData.roles" :key="'r' + i">
              <rect :x="134 + i * (438 / chartData.roles.length)" :y="1238 + 168 - Math.min(100, bar.value) / 100 * 168" :width="(438 / chartData.roles.length) * 0.69" :height="Math.min(100, bar.value) / 100 * 168" :fill="bar.color" />
              <text :x="134 + i * (438 / chartData.roles.length) + (438 / chartData.roles.length) * 0.345" :y="1238 + 168 - Math.min(100, bar.value) / 100 * 168 - 7" text-anchor="middle" font-size="12" fill="#555">{{ bar.value }}</text>
            </g>
            <text v-for="(bar, i) in chartData.roles" :key="'rl' + i" :x="134 + (i + 0.5) * (438 / chartData.roles.length)" :y="1424" text-anchor="middle" font-size="12" fill="#555">{{ bar.label }}</text>
            <!-- Big Five radar -->
            <polygon v-if="chartData.bigFive.every(v => v >= 0)"
              :points="chartData.bigFive.map((v, i) => {
                const angle = (-90 + i * 72) * Math.PI / 180;
                const len = Math.max(0, Math.min(30, v)) / 30 * 90;
                return `${904 + Math.cos(angle) * len},${323 + Math.sin(angle) * len}`;
              }).join(' ')"
              fill="#6ac36c" fill-opacity="0.32" stroke="#6ac36c" stroke-width="2" />
            <text v-for="(v, i) in chartData.bigFive" :key="'bf' + i"
              :x="904 + Math.cos((-90 + i * 72) * Math.PI / 180) * (Math.max(0, Math.min(30, v)) / 30 * 90)"
              :y="323 + Math.sin((-90 + i * 72) * Math.PI / 180) * (Math.max(0, Math.min(30, v)) / 30 * 90) - 5"
              font-size="11" text-anchor="middle" fill="#666">{{ v }}</text>
            <!-- Abilities bars (if present) -->
            <template v-if="hasAbilities && chartData.abilities.length > 0">
              <g v-for="(bar, i) in chartData.abilities" :key="'a' + i">
                <rect :x="132 + i * (938 / chartData.abilities.length)" :y="873 + 220 - Math.min(100, bar.value) / 100 * 220" :width="(938 / chartData.abilities.length) * 0.69" :height="Math.min(100, bar.value) / 100 * 220" :fill="bar.color" />
              </g>
            </template>
          </template>
          <!-- talent-05: roles bars -->
          <template v-if="page.id === 'talent-05' && chartData.roles.length > 0">
            <g v-for="(bar, i) in chartData.roles" :key="'t5r' + i">
              <rect :x="220 + i * (850 / chartData.roles.length)" :y="277 + 234 - Math.min(100, bar.value) / 100 * 234" :width="(850 / chartData.roles.length) * 0.69" :height="Math.min(100, bar.value) / 100 * 234" :fill="bar.color" />
            </g>
          </template>
          <!-- talent-07: motivation bars -->
          <template v-if="page.id === 'talent-07'">
            <g v-for="(bar, i) in chartData.motivation" :key="'t7m' + i">
              <rect v-if="bar.value !== null" :x="194 + i * (853 / chartData.motivation.length)" :y="254 + 179 - Math.min(100, bar.value) / 100 * 179" :width="(853 / chartData.motivation.length) * 0.69" :height="Math.min(100, bar.value) / 100 * 179" :fill="bar.color" />
            </g>
          </template>
        </svg>

        <!-- Slot text overlays -->
        <div v-for="s in page.slots" :key="s.id" class="slot"
          :style="{ left: `${s.x / page.width * 100}%`, top: `${s.y / page.height * 100}%`, width: `${s.width / page.width * 100}%`, height: `${s.height / page.height * 100}%` }">
          <div class="slot-text" :style="{ fontSize: `${(page.id === 'talent-01' ? 24 : page.document === 'data' ? 12 : 16) / page.width * 100}cqw` }"
            style="white-space: pre-wrap">{{ mode === 'computed' ? (computedFields[s.id] ?? '') : '' }}</div>
        </div>

        <!-- Standard mode label -->
        <div v-if="mode === 'computed' && hasAbilities" class="inference-label"
          :style="{ fontSize: `${12 / page.width * 100}cqw` }">
          {{ isStandard ? '能力为模型推算参考评分' : '能力为反推估计 · 非原版实算' }} · 不作自动录用依据
        </div>
      </div>
    </div>
    <p class="provenance no-print">版式参考用户提供的2025版PDF；展示品牌已统一为齐论AI，旧二维码、网址及联系电话已移除。</p>
  </section>
</template>

<style scoped>
.report-studio { background: #f5f5f5; border-radius: 8px; padding: 16px; }
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.toolbar h3 { margin: 0; font-size: 18px; }
.toolbar p { margin: 4px 0 0; color: #666; font-size: 13px; }
.controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.controls select { padding: 4px 8px; border: 1px solid #dcdfe6; border-radius: 4px; }
.controls button { padding: 6px 16px; border: 1px solid #dcdfe6; border-radius: 4px; background: white; cursor: pointer; }
.controls .save-btn { background: #409eff; color: white; border-color: #409eff; }
.modebar { padding: 8px 12px; background: #fdf6ec; border-radius: 4px; margin-bottom: 12px; }
.modebar p { margin: 0; color: #b88230; font-size: 13px; }
.scroll { overflow-x: auto; }
.sheet { position: relative; margin: 0 auto; background: white; box-shadow: 0 2px 8px rgba(0,0,0,.08); container-type: inline-size; }
.sheet-vector { width: 100%; height: 100%; display: block; }
.slot { position: absolute; overflow: hidden; }
.slot-text { padding: 2px 4px; line-height: 1.4; color: #333; }
.header-logo { position: absolute; z-index: 2; }
.header-logo img { width: 100%; height: 100%; object-fit: contain; }
.qr-removed { position: absolute; background: white; z-index: 2; }
.brand-mask { position: absolute; background: white; z-index: 2; }
.footer-brand { position: absolute; color: #999; z-index: 2; }
.body-brand { position: absolute; color: #666; z-index: 2; }
.computed-plots { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
.inference-label { position: absolute; bottom: 2%; left: 50%; transform: translateX(-50%); color: #999; z-index: 3; white-space: nowrap; }
.provenance { margin-top: 12px; color: #909399; font-size: 12px; }
</style>
