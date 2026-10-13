import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
// Legacy admin-web cascade order: styles.css → premium.css → unified-ui.css → home-refinement.css (+ h5-reference).
import './styles/base.css';
import './styles/theme.css';
import './styles/unified.css';
import './styles/home.css';
import './styles/h5.css';

createApp(App).use(router).mount('#root');
