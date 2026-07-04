import { createRoot } from 'react-dom/client'
import UI from './UI.jsx'

export default function mountUI(container)
{
    const root = createRoot(container)
    root.render(<UI />)
    return root
}
