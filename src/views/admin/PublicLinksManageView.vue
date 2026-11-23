<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppPagination from '@/components/AppPagination.vue';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { SettingOutlined } from '@ant-design/icons-vue';
import { usePublicLinksStore } from '@/stores/publicLinks';
import { useTenantStore } from '@/stores/tenant';
import LinksManageModal from '@/components/personal-links/LinksManageModal.vue';
import PublicLinksSection from '@/components/public-links/PublicLinksSection.vue';
const store = usePublicLinksStore();
const tenant = useTenantStore();
const open = ref(false);
const currentPage = ref(1);
const pageSize = ref(10);
const pagedLinks = computed(() => store.links.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value));
watch(() => store.links.length, (total) => {
  currentPage.value = Math.min(currentPage.value, Math.max(1, Math.ceil(total / pageSize.value)));
});
function changePage(page: number, size: number) {
  currentPage.value = size !== pageSize.value ? 1 : page;
  pageSize.value = size;
}
</script>
<template>
  <a-result v-if="!store.canWrite" status="403" title="暂无公共网站管理权限" sub-title="请联系本租户运营管理员维护公共网站。" />
  <div v-else class="public-manage-page">
    <div class="public-manage-panel">
    <AdminPageHeader title="公共网站" :subtitle="`${tenant.currentTenantName} · 维护本租户共享网址，启用后供全部用户访问。`">
      <template #actions><a-button type="primary" @click="open = true"><template #icon><SettingOutlined /></template>维护网站</a-button></template>
    </AdminPageHeader>
    <a-alert v-if="store.loadError || store.conflict" show-icon type="warning" :message="store.loadError || '公共网站有更新，请重新加载'"><template #action><a-button size="small" @click="store.reload">重新加载</a-button></template></a-alert>
    <div class="public-list-heading">已配置网站 <span>共 {{ store.links.length }} 个</span></div>
    <div class="public-table"><a-table :data-source="pagedLinks" row-key="id" size="middle" :pagination="false" :scroll="{ x: 680 }">
      <a-table-column title="顺序" key="sort" :width="72"><template #default="{ record }">{{ record.sort + 1 }}</template></a-table-column>
      <a-table-column title="名称" data-index="title" key="title" :width="160" ellipsis />
      <a-table-column title="网址" key="url" ellipsis><template #default="{ record }"><a :href="record.url" target="_blank" rel="noopener noreferrer" :title="record.url">{{ record.url }}</a></template></a-table-column>
      <a-table-column title="状态" key="enabled" :width="90"><template #default="{ record }"><a-tag :color="record.enabled !== false ? 'green' : 'default'">{{ record.enabled !== false ? '启用' : '停用' }}</a-tag></template></a-table-column>
      <a-table-column title="适用范围" key="scope" :width="130"><template #default>本租户全部用户</template></a-table-column>
    </a-table>
    <AppPagination class="public-pagination" :total="store.links.length" :current="currentPage" :page-size="pageSize" @change="changePage" />
    </div>
    <section class="public-preview"><div class="public-list-heading">用户入口预览<span>仅展示启用的网站</span></div><PublicLinksSection heading="公共" personal-style /></section>
    </div>
    <LinksManageModal v-model:open="open" :store="store" title="维护公共网站" subtitle="本租户共享 · 停用后用户入口不展示" public-mode />
  </div>
</template>
<style scoped>
.public-manage-page { display: flex; flex-direction: column; min-height: 100%; padding: 16px 20px; background: #f9fafb; box-sizing: border-box; }
.public-manage-panel { padding: 20px 24px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.public-list-heading { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #374151; margin: 16px 0 10px; }
.public-list-heading span { color: #9ca3af; font-size: 12px; font-weight: 400; }
.public-table :deep(.ant-table-thead > tr > th) { background: #f3f4f6; font-size: 12px; color: #6b7280; font-weight: 500; }
.public-table :deep(.ant-table-cell) { font-size: 12px; }
.public-table a { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.public-pagination { margin-top: 16px; }
.public-preview { border-top: 1px solid #f0f0f0; margin-top: 16px; }
.public-preview :deep(.public-links) { border: 0; margin: 0; padding: 0; }
.public-preview :deep(.public-head) { display: none; }
@media(max-width:700px) { .public-manage-page { padding: 8px; } .public-manage-panel { padding: 12px; } }
</style>
