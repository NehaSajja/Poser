// The production app in an isolated, non-persisted canvas for browser checks.
import React from 'react';
import { createRoot } from 'react-dom/client';
import TldrawApp from '../src/tldraw/TldrawApp';
import '../src/style.css';

createRoot(document.getElementById('root')).render(<TldrawApp persistenceKey=""/>);
