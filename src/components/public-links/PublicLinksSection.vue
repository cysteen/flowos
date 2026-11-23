<script setup lang="ts">
import { BookOutlined, GlobalOutlined } from '@ant-design/icons-vue';
import { usePublicLinksStore } from '@/stores/publicLinks';
withDefaults(defineProps<{ heading?: string; personalStyle?: boolean }>(), { heading: '公共网站', personalStyle: false });
const store = usePublicLinksStore();
</script>
<template>
  <section v-if="store.scopeKey" class="public-links" :aria-label="heading">
    <div class="public-head"><GlobalOutlined /><strong>{{ heading }}</strong><span>本租户共享</span></div>
    <div v-if="store.loadError || store.conflict" class="public-status">{{ store.loadError || '公共网站有更新' }} <button type="button" @click="store.reload">重新加载</button></div>
    <div v-if="!store.loadError && !store.visibleLinks.length" class="public-empty">暂无可用公共网站</div>
    <ul v-else class="public-list"><li v-for="item in store.visibleLinks" :key="item.id"><a :href="item.url" target="_blank" rel="noopener noreferrer" :title="`${item.title}\n${item.url}`"><component :is="personalStyle ? BookOutlined : GlobalOutlined" /><span>{{ item.title }}</span></a></li></ul>
  </section>
</template>
<style scoped>
.public-links{border-top:1px solid #e5e7eb;margin-top:10px;padding-top:10px;min-width:0}.public-head{display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;margin-bottom:7px}.public-head>span:last-child{font-size:10px;color:#9ca3af;margin-left:auto}.public-list{padding:0;margin:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px;max-height:min(180px,30vh);overflow:auto}.public-list li{min-width:0;max-width:100%}.public-list a{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:4px 9px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;font-size:11px}.public-list a>span:last-child{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.public-list a:hover{background:#eff6ff;border-color:#bfdbfe}.public-empty,.public-status{font-size:11px;color:#9ca3af}.public-status button{border:0;background:none;color:#1a6fff;cursor:pointer}
</style>
