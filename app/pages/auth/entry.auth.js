import elpisBoot from '$elpisBoot';
import auth from './auth.vue';

const routes = [{
  path: '/view/auth/login',
  component: () => import('./complex-view/login/login.vue')
}];

elpisBoot(auth, { routes })
