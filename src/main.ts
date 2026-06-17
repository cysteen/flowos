import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './styles/global.css';

const app = createApp(App);

// 先装 Pinia 再装 Router：路由守卫内 useUserStore() 才有可用实例
app.use(createPinia());
app.use(router);

app.mount('#app');
