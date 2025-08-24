import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './style.css';

// Import pages
import Home from './pages/Home.vue';
import GettingStarted from './pages/GettingStarted.vue';
import Documentation from './pages/Documentation.vue';
import Examples from './pages/Examples.vue';
import Plugins from './pages/Plugins.vue';
import API from './pages/API.vue';

const routes = [
  { path: '/', component: Home },
  { path: '/getting-started', component: GettingStarted },
  { path: '/docs', component: Documentation },
  { path: '/examples', component: Examples },
  { path: '/plugins', component: Plugins },
  { path: '/api', component: API },
];

const router = createRouter({
  history: createWebHistory('/sightedit/'),
  routes,
});

const app = createApp(App);
app.use(router);
app.mount('#app');