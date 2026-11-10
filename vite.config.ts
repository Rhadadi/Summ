import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
// In development the API runs separately on :9000; proxying keeps the session cookie same-origin.
export default defineConfig({plugins:[react()],base:'./',server:{allowedHosts:true,proxy:{'/api':'http://127.0.0.1:9000'}}});
