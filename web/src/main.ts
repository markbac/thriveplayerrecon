import { WebApp } from './app_ui';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (root) {
    new WebApp(root);
  }
});
