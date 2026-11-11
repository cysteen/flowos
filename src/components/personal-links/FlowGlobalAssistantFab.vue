<script setup lang="ts">
import PersonalLinksFabMenu from './PersonalLinksFabMenu.vue';

const avatarUrl = `${import.meta.env.BASE_URL}images/ai-assistant-avatar.png`;
</script>

<template>
  <Teleport to="body">
    <div class="global-fab-wrap">
      <PersonalLinksFabMenu>
        <button type="button" class="global-fab" title="悬停查看我的链接" aria-label="我的链接">
          <img :src="avatarUrl" alt="" class="global-fab-img" />
        </button>
      </PersonalLinksFabMenu>
    </div>
  </Teleport>
</template>

<style scoped>
.global-fab-wrap {
  position: fixed;
  right: 24px;
  bottom: 80px;
  z-index: 199;
  pointer-events: none;
}

.global-fab-wrap :deep(.fab-menu-anchor) {
  pointer-events: auto;
}

.global-fab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  padding: 0;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #e8f4ff;
  cursor: pointer;
  box-shadow: 0 4px 18px rgba(26, 111, 255, 0.22);
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
}
.global-fab:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 24px rgba(26, 111, 255, 0.32);
}

.global-fab-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 18%;
  display: block;
}
</style>
