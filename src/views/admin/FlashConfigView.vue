<script setup lang="ts">
/**
 * 管理后台 · 工单配置 ·「刷机配置」（930 教育刷机单 PRD §10 / 页面规格 P6 / M65 / M68）。
 * 一页四块，自上而下：支持刷机机型 → 刷机原因 → 失败原因 → 回传超时时长。
 * 可见角色：工单运营、管理员（进后台本身由路由守卫按 hasAdminEntry 判定，本页再按角色收口）。
 */
import { computed, ref, watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import { PlusOutlined } from '@ant-design/icons-vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { useUserStore } from '@/stores/user';
import FlashModelSection from './components/flash/FlashModelSection.vue';
import FlashReasonSection from './components/flash/FlashReasonSection.vue';
import FlashFailReasonSection from './components/flash/FlashFailReasonSection.vue';
import FlashTimeoutSection from './components/flash/FlashTimeoutSection.vue';
import { FLASH_CONFIG_ROLES } from './components/flash/flashConfigCatalog';

const user = useUserStore();
const router = useRouter();

const allowed = computed(() => FLASH_CONFIG_ROLES.includes(user.roleKey));
watchEffect(() => {
  if (!allowed.value) router.replace('/admin');
});

const modelSection = ref<InstanceType<typeof FlashModelSection> | null>(null);
</script>

<template>
  <div v-if="allowed" class="flash-config-view">
    <div class="fc-panel">
      <AdminPageHeader title="刷机配置">
        <template #actions>
          <a-button type="primary" @click="modelSection?.openCreate()">
            <template #icon><PlusOutlined /></template>
            新增机型
          </a-button>
        </template>
      </AdminPageHeader>

      <div class="fc-blocks">
        <FlashModelSection ref="modelSection" />
        <FlashReasonSection />
        <FlashFailReasonSection />
        <FlashTimeoutSection />
      </div>
    </div>
  </div>
</template>

<style scoped>
.flash-config-view { padding: 16px 20px; background: #f9fafb; min-height: 100%; }
.fc-panel {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px 24px;
}
.fc-blocks { display: flex; flex-direction: column; gap: 28px; }
</style>
