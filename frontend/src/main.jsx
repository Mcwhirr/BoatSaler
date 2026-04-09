import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'

// React 应用入口：将 App 挂载到根节点。
createRoot(document.getElementById('root')).render(
  <App />
)
