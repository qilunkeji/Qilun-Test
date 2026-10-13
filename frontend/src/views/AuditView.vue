<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, date } from '../logic/api';
import { auditDisplay } from '../logic/ui-presentation';
import EmptyBox from '../components/EmptyBox.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy Audit (main.tsx): 最近100条授权范围内的事件.
type AuditItem = { id: string; action: string; actor_id: string; actor_label?: string; object_id: string; created_at: string };
const items = ref<AuditItem[] | null>(null);
const error = ref('');
const copyError = ref('');

async function load() {
  error.value = '';
  items.value = null;
  try {
    items.value = (await api<{ items: AuditItem[] }>('/audit-events?page_size=100')).items;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);

function copyReference(x: AuditItem) {
  navigator.clipboard.writeText(`事件 ${x.id}\n动作 ${x.action}\n对象 ${x.object_id ?? ''}\n操作人 ${x.actor_id}`)
    .catch(() => { copyError.value = '复制未获浏览器许可，可选择引用手动复制。'; });
}
</script>

<template>
  <div class="section-heading">
    <div>
      <h2>操作审计</h2>
      <p>最近100条授权范围内的事件；“已记录”不等于所有业务均成功。</p>
    </div>
  </div>
  <section class="panel">
    <RetryBox v-if="error" :text="error" @retry="load" />
    <LoadingState v-else-if="!items" text="正在读取审计记录…" />
    <EmptyBox v-else-if="!items.length">当前授权范围内尚无审计记录。</EmptyBox>
    <div v-else class="table-scroll">
      <table>
        <thead><tr><th>时间</th><th>动作</th><th>对象 / 引用</th><th>结果</th><th>追溯信息</th></tr></thead>
        <tbody>
          <tr v-for="x in items" :key="x.id">
            <td>{{ date(x.created_at) }}</td>
            <td>{{ auditDisplay(x.action).label }}<small v-if="!auditDisplay(x.action).known">事件含义待解释，保留原码</small></td>
            <td>{{ auditDisplay(x.action).object }}<small class="mono">{{ x.object_id?.slice(0, 8) ?? '—' }}</small></td>
            <td>{{ auditDisplay(x.action).result }}</td>
            <td>
              <details class="audit-reference">
                <summary>完整引用</summary>
                <p class="mono">事件：{{ x.action }}<br />对象：{{ x.object_id ?? '未提供' }}<br />操作人：{{ x.actor_label ?? x.actor_id }}</p>
                <button @click="copyReference(x)">复制引用</button>
              </details>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
