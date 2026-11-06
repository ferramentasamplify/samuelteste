import LuizContactsDashboard from "./LuizContactsDashboard";
import { useEffect, useState } from 'react';
import Commissions from './Commissions';

function App() {
  const [commissions, setCommissions] = useState(window.location.hash === '#comissoes');
  useEffect(() => { const change = () => setCommissions(window.location.hash === '#comissoes'); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  return <><nav className="sniper-navigation" aria-label="Navegação principal"><a href="#dashboard" aria-current={!commissions ? 'page' : undefined}>Dashboard</a><a href="#comissoes" aria-current={commissions ? 'page' : undefined}>Comissões ↗</a></nav>{commissions ? <Commissions /> : <LuizContactsDashboard />}</>;
}

export default App;
