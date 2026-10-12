<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../logic/api';

type Invite = { id: string; name: string; title: string; submitted_at: string | null; participant_kind: string };
type Talent = { id: string; name: string };
const invites = ref<Invite[]>([]);
const talents = ref<Talent[]>([]);
const selectedInvite = ref('');
const selectedTalent = ref('');
const binding = ref(false);

async function load() {
  const inv = await api<{ items: Invite[] }>('/assessment/invites?view=reports');
  invites.value = inv.items;
  const tal = await api<{ items: Talent[] }>('/talents?page_size=100');
  talents.value = tal.items;
}

async function bind() {
  binding.value = true;
  try {
    await api(`/assessment/invites/${selectedInvite.value}/bind`, { candidate_id: selectedTalent.value, confirm: 'bind_assessment' });
    ElMessage.success('绑定成功');
  } catch (e) { ElMessage.error((e as Error).message); } finally { binding.value = false; }
}

onMounted(load);
</script>

<template>
  <div style="max-width: 600px">
    <h2>测评绑定人才</h2>
    <el-form label-position="top">
      <el-form-item label="选择已提交的测评">
        <el-select v-model="selectedInvite" filterable>
          <el-option v-for="i in invites" :key="i.id" :value="i.id" :label="`${i.name} · ${i.title}`" />
        </el-select>
      </el-form-item>
      <el-form-item label="选择人才档案">
        <el-select v-model="selectedTalent" filterable>
          <el-option v-for="t in talents" :key="t.id" :value="t.id" :label="t.name" />
        </el-select>
      </el-form-item>
      <el-button type="primary" :loading="binding" :disabled="!selectedInvite || !selectedTalent" @click="bind" style="width: 100%">绑定</el-button>
    </el-form>
  </div>
</template>
