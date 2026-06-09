import { useState } from 'react';
import LoadingScreen from './components/LoadingScreen';
import MainApp from './components/MainApp';
import './index.css';

export default function App() {
  const [screen, setScreen] = useState<'loading' | 'main'>('loading');

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      {screen === 'loading' && (
        <LoadingScreen onComplete={() => setScreen('main')} />
      )}
      {screen === 'main' && (
        <div className="fade-in" style={{ width: '100%', height: '100%' }}>
          <MainApp />
        </div>
      )}
    </div>
  );
}
