import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] || '';
const pagesBase = process.env.CUSTOM_DOMAIN === 'true' ? '/' : repoName ? `/${repoName}/` : '/';

export default defineConfig({
  plugins: [react()],
  base: isGitHubActions ? pagesBase : '/',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
  build: {
    sourcemap: false,
  },
});
