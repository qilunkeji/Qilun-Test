<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, date } from '../logic/api';
import Notice from '../components/Notice.vue';
import EmptyBox from '../components/EmptyBox.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy Recruiting (recruiting.tsx): recruit-layout compose + material library.
type Material = { id: string; title: string; category: string; source_name: string; char_count: number; created_at: string; archived_at?: string | null };

const materials = ref<Material[] | null>(null);
const showCreate = ref(false);
const creating = ref(false);
const error = ref('');
const message = ref('');
const newMaterial = ref({ title: '', category: '公司介绍', source_name: '', content: '' });
const optimizeForm = ref({
  title: '', location: '', salary_min: null as number | null, salary_max: null as number | null,
  salary_months: 12, experience: '', education: '', style: '专业清晰', requirements: '', material_ids: [] as string[],
});
const optimizing = ref(false);

async function loadMaterials() {
  error.value = '';
  try {
    materials.value = (await api<{ items: Material[] }>('/recruiting/materials')).items;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(loadMaterials);

function toggleMaterial(id: string) {
  const list = optimizeForm.value.material_ids;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else list.push(id);
}

async function createMaterial() {
  creating.value = true;
  error.value = '';
  try {
    await api('/recruiting/materials', newMaterial.value);
    message.value = '资料已保存。';
    showCreate.value = false;
    newMaterial.value = { title: '', category: '公司介绍', source_name: '', content: '' };
    await loadMaterials();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    creating.value = false;
  }
}

async function optimize() {
  optimizing.value = true;
  error.value = '';
  try {
    const result = await api<{ id: string; status: string }>('/ai/run', { feature: 'job_optimize', recruiting: optimizeForm.value, authorized_to_send: true });
    message.value = `任务已提交（${result.id}），等待 AI 处理；可在 AI 助手中查看结果。`;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    optimizing.value = false;
  }
}

async function archive(id: string) {
  try {
    await api(`/recruiting/materials/${id}/archive`, {});
    await loadMaterials();
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">RECRUITMENT STUDIO</span>
      <h1>招聘优化</h1>
      <p>让公司真实的吸引力，成为候选人愿意了解这份工作的理由。</p>
    </div>
    <div class="actions"><button @click="$router.push('/assistant')">AI 助手 · 材料分析</button></div>
  </div>

  <Notice v-if="error" kind="error">{{ error }}</Notice>
  <Notice v-if="message" kind="success">{{ message }}</Notice>

  <div class="recruit-layout">
    <section class="panel recruit-compose">
      <div class="section-heading">
        <div><h2>岗位文案生成</h2><p>基于真实材料生成初稿；发布前由人工确认。</p></div>
      </div>
      <form class="form-grid recruit-fields" @submit.prevent="optimize">
        <label class="field"><span>岗位 *</span><input v-model="optimizeForm.title" required /></label>
        <label class="field"><span>地点</span><input v-model="optimizeForm.location" /></label>
        <label class="field"><span>风格</span>
          <select v-model="optimizeForm.style"><option>专业清晰</option><option>有吸引力</option><option>简洁直接</option></select>
        </label>
        <label class="field"><span>最低月薪</span><input v-model.number="optimizeForm.salary_min" type="number" min="0" /></label>
        <label class="field"><span>最高月薪</span><input v-model.number="optimizeForm.salary_max" type="number" min="0" /></label>
        <label class="field"><span>年薪月数</span><input v-model.number="optimizeForm.salary_months" type="number" min="12" max="24" /></label>
        <label class="field"><span>经验</span><input v-model="optimizeForm.experience" /></label>
        <label class="field wide"><span>补充需求</span><textarea v-model="optimizeForm.requirements" rows="3" /></label>
        <div class="form-footer sticky-actions">
          <p>生成内容为初稿；不向任何外部渠道发布。</p>
          <button class="primary" :disabled="optimizing || !optimizeForm.title">{{ optimizing ? '生成中…' : '生成招聘文案' }}</button>
        </div>
      </form>
    </section>

    <details class="panel recruit-library" open>
      <summary>参考资料</summary>
      <div class="section-heading">
        <div><h2>公司资料库</h2><p>材料长期积累，供生成引用。</p></div>
        <button class="primary" @click="showCreate = !showCreate">{{ showCreate ? '收起新建' : '新建资料' }}</button>
      </div>
      <form v-if="showCreate" class="form-grid" @submit.prevent="createMaterial">
        <label class="field"><span>标题 *</span><input v-model="newMaterial.title" required /></label>
        <label class="field"><span>分类</span>
          <select v-model="newMaterial.category"><option>公司介绍</option><option>产品与业务</option><option>团队与福利</option><option>岗位参考</option><option>其他</option></select>
        </label>
        <label class="field wide"><span>来源名称</span><input v-model="newMaterial.source_name" /></label>
        <label class="field wide"><span>内容 *</span><textarea v-model="newMaterial.content" rows="6" required /></label>
        <div class="form-footer"><span></span><button class="primary" :disabled="creating">{{ creating ? '保存中…' : '保存资料' }}</button></div>
      </form>
      <RetryBox v-if="error" :text="error" @retry="loadMaterials" />
      <LoadingState v-else-if="!materials" text="正在读取资料…" />
      <EmptyBox v-else-if="!materials.length">先沉淀公司介绍、产品与业务说明等真实材料。</EmptyBox>
      <div v-else class="table-scroll">
        <table>
          <thead><tr><th>标题</th><th>分类</th><th>来源</th><th>字数</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="m in materials" :key="m.id">
              <td><strong>{{ m.title }}</strong></td>
              <td>{{ m.category }}</td>
              <td>{{ m.source_name || '—' }}</td>
              <td>{{ m.char_count }}</td>
              <td>{{ date(m.created_at) }}</td>
              <td><button @click="archive(m.id)">归档</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted">生成时在左侧表单选择引用的资料。</p>
    </details>
  </div>
</template>
