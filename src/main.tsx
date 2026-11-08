import React from 'react';import{createRoot}from 'react-dom/client';
import '@fontsource/roboto/400.css';import '@fontsource/roboto/500.css';import '@fontsource/roboto/700.css';
import '@fontsource-variable/roboto-serif';import '@fontsource-variable/vazirmatn';
import App from './App';import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
