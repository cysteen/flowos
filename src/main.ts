import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useFlashStore } from './stores/flash';
import { useDispatchStore } from './stores/dispatch';
import './styles/global.css';
import './styles/page-tabs.css';

const app = createApp(App);

// 先装 Pinia 再装 Router：路由守卫内 useUserStore() 才有可用实例
app.use(createPinia());
// 刷机服务随应用启动：读回刷机单缓存并起回传对账（930 教育刷机单），任何页面进来都续得上计时
try {
  useFlashStore();
} catch (err) {
  console.error('[FlowOS] flash store init failed', err);
}
// 【1215】智能派单随应用启动：回放派单改写过的工单行，任何页面进来工单与派单状态一致
try {
  useDispatchStore();
} catch (err) {
  console.error('[FlowOS] dispatch store init failed', err);
}
app.use(router);

app.config.errorHandler = (err, _instance, info) => {
  console.error('[FlowOS] render error', err, info);
};

app.mount('#app');
