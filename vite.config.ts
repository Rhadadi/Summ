import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
// Every build names its own service-worker version, so a release replaces the app cached on readers' devices.
const swVersion={name:'sw-version',apply:'build' as const,closeBundle(){const f='dist/sw.js';if(existsSync(f))writeFileSync(f,readFileSync(f,'utf8').replace("'inkling-v1'","'inkling-"+Date.now().toString(36)+"'"));}};
// In development the API runs separately on :9000; proxying keeps the session cookie same-origin.
export default defineConfig({plugins:[react(),swVersion],base:'./',server:{allowedHosts:true,proxy:{'/api':'http://127.0.0.1:9000'}}});
