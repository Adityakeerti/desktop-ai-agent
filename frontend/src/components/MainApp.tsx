import { useState, useRef, useEffect, useCallback } from 'react';
import GlobeCanvas from './GlobeCanvas';

/* ─── pywebview type declarations ─────────────────────────────────────────── */
declare global {
  interface Window {
    pywebview?: {
      api: {
        ask_llm            : (c: string)  => Promise<{ action: string; full: Record<string,unknown>; result: string } | null>;
        execute_action     : (a: string)  => Promise<string>;
        clear_memory       : ()           => Promise<string>;
        get_providers      : ()           => Promise<string[]>;
        set_provider       : (n: string)  => Promise<string>;
        get_active_provider: ()           => Promise<string>;
        get_system_info_quick: ()         => Promise<{ cpu: number|string; ram_used: number|string; ram_total: number|string; ram_pct: number|string }>;
        save_chat_log      : (t: string)  => Promise<string>;
        close_window       : ()           => Promise<void>;
      };
    };
  }
}

/* ─── Types ────────────────────────────────────────────────────────────────── */
type Role = 'rage' | 'user' | 'result' | 'error' | 'action' | 'sys';
interface Msg { id: number; role: Role; text: string; ts: string; }
type PanelId = 'uplink' | 'apps' | 'input' | 'file' | 'system' | 'comm';

/* ─── Constants ────────────────────────────────────────────────────────────── */
const NAV_ITEMS: { id: PanelId; icon: string; label: string }[] = [
  { id: 'uplink', icon: 'radar',            label: 'Core Uplink'  },
  { id: 'apps',   icon: 'apps',             label: 'App Control'  },
  { id: 'input',  icon: 'keyboard',         label: 'HID & Screen' },
  { id: 'file',   icon: 'folder_open',      label: 'File Matrix'  },
  { id: 'system', icon: 'terminal',         label: 'System CLI'   },
  { id: 'comm',   icon: 'travel_explore',   label: 'Comms & Web'  },
];

const QUICK_CHIPS: { label: string; icon: string; cmd: string }[] = [
  { label: 'Screenshot',  icon: 'screenshot',    cmd: 'take a screenshot and save it to my desktop' },
  { label: 'Sys Info',    icon: 'memory',        cmd: 'get system info cpu ram and disk' },
  { label: 'Clipboard',   icon: 'content_paste', cmd: 'get clipboard contents' },
  { label: 'Google',      icon: 'language',      cmd: 'open https://www.google.com' },
  { label: 'Explorer',    icon: 'folder_open',   cmd: 'open explorer' },
  { label: 'Notepad',     icon: 'edit_note',     cmd: 'open notepad' },
  { label: 'Volume 70%',  icon: 'volume_up',     cmd: 'set volume to 70' },
  { label: 'Task Mgr',    icon: 'monitor_heart', cmd: 'open task manager' },
];

/* ─── Panel action button groups ──────────────────────────────────────────── */
const APP_ACTIONS = [
  { label: 'Notepad',      icon: 'edit_note',     cmd: 'open notepad' },
  { label: 'Calculator',   icon: 'calculate',     cmd: 'open calculator' },
  { label: 'Explorer',     icon: 'folder_open',   cmd: 'open explorer' },
  { label: 'Chrome',       icon: 'language',      cmd: 'open chrome' },
  { label: 'Task Manager', icon: 'monitor_heart', cmd: 'open task manager' },
  { label: 'VS Code',      icon: 'code',          cmd: 'open vs code' },
  { label: 'Spotify',      icon: 'music_note',    cmd: 'open spotify' },
  { label: 'Discord',      icon: 'forum',         cmd: 'open discord' },
  { label: 'Paint',        icon: 'palette',       cmd: 'open paint' },
  { label: 'PowerShell',   icon: 'terminal',      cmd: 'open powershell' },
  { label: 'Brave',        icon: 'security',      cmd: 'open brave' },
  { label: 'Edge',         icon: 'edge',          cmd: 'open edge' },
];

const HID_ACTIONS = [
  { label: 'Screenshot',   icon: 'screenshot',    cmd: 'take a screenshot and save it to my desktop' },
  { label: 'Clipboard Get',icon: 'content_paste', cmd: 'get clipboard contents' },
  { label: 'Scroll Down',  icon: 'expand_more',   cmd: 'scroll down 3' },
  { label: 'Scroll Up',    icon: 'expand_less',   cmd: 'scroll up 3' },
  { label: 'Vol Up',       icon: 'volume_up',     cmd: 'set volume to 80' },
  { label: 'Vol Down',     icon: 'volume_down',   cmd: 'set volume to 40' },
  { label: 'Mute',         icon: 'volume_off',    cmd: 'set volume to 0' },
  { label: 'Active Window',icon: 'open_in_full',  cmd: 'get active window' },
];

const SYSTEM_ACTIONS = [
  { label: 'Sys Info',    icon: 'info',            cmd: 'get system info cpu ram and disk' },
  { label: 'IP Config',   icon: 'wifi',            cmd: 'run command ipconfig' },
  { label: 'Process List',icon: 'list',            cmd: 'run powershell Get-Process | Select-Object Name, CPU | Sort-Object CPU -Descending | Select-Object -First 15' },
  { label: 'Disk Usage',  icon: 'storage',         cmd: 'run powershell Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free' },
  { label: 'Services',    icon: 'settings_suggest',cmd: 'run powershell Get-Service | Where-Object {$_.Status -eq "Running"} | Select-Object -First 20 DisplayName' },
  { label: 'Network',     icon: 'network_check',   cmd: 'run command netstat -an | findstr ESTABLISHED' },
];

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const ts = () => new Date().toLocaleTimeString('en-US', { hour12: false });
const apiAvailable = () => !!window.pywebview?.api;

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function MainApp() {
  const [msgs, setMsgs]             = useState<Msg[]>([]);
  const [activeNav, setActiveNav]   = useState<PanelId>('uplink');
  const [input, setInput]           = useState('');
  const [busy, setBusy]             = useState(false);
  const [syncStatus, setSyncStatus] = useState('CALIBRATING...');
  const [cpuVal, setCpuVal]         = useState<string>('--.--%');
  const [ramVal, setRamVal]         = useState<string>('--GB');
  const [providers, setProviders]   = useState<string[]>(['Auto (Fallback)']);
  const [activeProvider, setActiveProvider] = useState('Auto (Fallback)');
  const [micActive, setMicActive]   = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const chatEndRef   = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const msgCounter   = useRef(0);
  const historyBuf   = useRef<string[]>([]);
  const historyIdx   = useRef(-1);
  // File panel state
  const [filePath, setFilePath]     = useState('');
  // Comm panel state
  const [urlInput, setUrlInput]     = useState('');
  const [searchInput, setSearchInput] = useState('');

  /* ── Add message ──────────────────────────────────────────────────────── */
  const addMsg = useCallback((role: Role, text: string) => {
    setMsgs(prev => [...prev, { id: ++msgCounter.current, role, text, ts: ts() }]);
  }, []);

  /* ── Init ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    addMsg('rage', 'R.A.G.E. uplink established. Neural core synchronized. All systems operational. I have preemptively optimized your session parameters. You may proceed.');
    addMsg('sys', 'Connected to pywebview API — full execution mode active.');

    // Load providers
    if (apiAvailable()) {
      window.pywebview!.api.get_providers().then(p => {
        setProviders(p);
      }).catch(() => {});
      window.pywebview!.api.get_active_provider().then(p => {
        setActiveProvider(p);
      }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Real system stats (every 5s) ─────────────────────────────────────── */
  useEffect(() => {
    const refresh = () => {
      if (!apiAvailable()) {
        // Fake values in dev mode
        setCpuVal((Math.random() * 30 + 10).toFixed(1) + '%');
        setRamVal((Math.random() * 4 + 8).toFixed(1) + 'GB');
        return;
      }
      window.pywebview!.api.get_system_info_quick().then(info => {
        setCpuVal(`${info.cpu}%`);
        setRamVal(`${info.ram_used}/${info.ram_total}GB`);
      }).catch(() => {});
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  /* ── Auto-scroll ──────────────────────────────────────────────────────── */
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  /* ── Ctrl+K → focus input ─────────────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setActiveNav('uplink');
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const onGlobeReady = useCallback(() => { setSyncStatus('ONLINE'); }, []);

  /* ── Submit pipeline ──────────────────────────────────────────────────── */
  async function submitCommand(cmd?: string) {
    const raw = (cmd ?? input).trim();
    if (!raw || busy) return;
    if (!cmd) setInput('');
    setBusy(true);
    historyBuf.current.unshift(raw);
    historyIdx.current = -1;
    addMsg('user', raw);

    if (!apiAvailable()) {
      await new Promise(r => setTimeout(r, 600));
      addMsg('sys', '⚠ Demo mode — PyWebView API not available. Run via python webview_app.py');
      setBusy(false);
      return;
    }

    try {
      const res = await window.pywebview!.api.ask_llm(raw);
      if (res?.action) {
        addMsg('action', `⚡ ACTION → ${res.action}`);
        const result = await window.pywebview!.api.execute_action(res.action);
        if (result.toLowerCase().startsWith('error')) {
          addMsg('error', result);
        } else {
          addMsg('result', result);
        }
      } else {
        addMsg('error', 'Command parsing failed — all LLM providers offline or unresponsive.');
      }
    } catch (e: any) {
      addMsg('error', 'CRITICAL ERROR: ' + (e?.message ?? String(e)));
    }
    setBusy(false);
  }

  /* ── Input history (↑ ↓) ─────────────────────────────────────────────── */
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { submitCommand(); return; }
    const cmds = historyBuf.current;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(historyIdx.current + 1, cmds.length - 1);
      historyIdx.current = next;
      if (cmds[next]) setInput(cmds[next]);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(historyIdx.current - 1, -1);
      historyIdx.current = next;
      setInput(next < 0 ? '' : cmds[next]);
    }
  }

  /* ── Provider change ──────────────────────────────────────────────────── */
  function handleProviderChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const name = e.target.value;
    setActiveProvider(name);
    if (apiAvailable()) {
      window.pywebview!.api.set_provider(name).then(() => {
        addMsg('sys', `LLM provider switched → ${name}`);
      }).catch(() => {});
    }
  }

  /* ── Mic / Voice input ────────────────────────────────────────────────── */
  function toggleMic() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      addMsg('sys', '⚠ Web Speech API not available in this browser/WebView.');
      return;
    }
    if (micActive) { setMicActive(false); return; }
    setMicActive(true);
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (ev: any) => {
      const transcript = ev.results[0][0].transcript;
      setInput(transcript);
      setMicActive(false);
    };
    rec.onerror = () => setMicActive(false);
    rec.onend   = () => setMicActive(false);
    rec.start();
  }

  /* ── Save chat log ────────────────────────────────────────────────────── */
  function saveChatLog() {
    const text = msgs.map(m => `[${m.ts}] ${m.role.toUpperCase()}: ${m.text}`).join('\n');
    if (apiAvailable()) {
      window.pywebview!.api.save_chat_log(text).then(msg => addMsg('sys', msg)).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => addMsg('sys', 'Chat log copied to clipboard.'));
    }
  }

  /* ── Close window ─────────────────────────────────────────────────────── */
  function closeWindow() {
    if (apiAvailable()) {
      window.pywebview!.api.close_window().catch(() => {});
    } else {
      window.close();
    }
  }

  /* ── Clear memory + chat ──────────────────────────────────────────────── */
  async function clearAll() {
    if (apiAvailable()) await window.pywebview!.api.clear_memory();
    setMsgs([]);
    addMsg('sys', 'Memory and chat cleared.');
    setShowClearModal(false);
  }

  /* ─────────────────────────────────────────────────────────────────────── */
  /* Render helpers                                                           */
  /* ─────────────────────────────────────────────────────────────────────── */

  function renderMsg(m: Msg) {
    const baseStyle: React.CSSProperties = {
      fontFamily: 'JetBrains Mono',
      lineHeight: 1.6,
      wordBreak: 'break-word',
    };

    if (m.role === 'user') return (
      <div key={m.id} className="flex flex-col items-end" style={{ gap: 4 }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#5f3e3e', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          USER [GUEST_01] · {m.ts}
        </div>
        <div style={{ ...baseStyle, maxWidth: '85%', padding: '10px 14px', background: 'rgba(0,40,60,0.55)', border: '1px solid rgba(0,219,233,0.2)', fontSize: 12, color: '#ffdad8', textAlign: 'right' }}>
          {m.text}
        </div>
      </div>
    );

    if (m.role === 'rage') return (
      <div key={m.id} className="flex flex-col" style={{ gap: 4 }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#af8786', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          R.A.G.E. [SYS_ADMIN] · {m.ts}
        </div>
        <div style={{ ...baseStyle, maxWidth: '85%', padding: '10px 14px', background: 'rgba(46,26,26,0.65)', border: '1px solid rgba(95,62,62,0.4)', fontSize: 12, color: '#ffdad8' }}>
          {m.text}
        </div>
      </div>
    );

    if (m.role === 'action') return (
      <div key={m.id} style={{ ...baseStyle, padding: '6px 14px', background: 'rgba(0,40,30,0.4)', border: '1px solid rgba(0,255,156,0.25)', fontSize: 11, color: '#19ff9d', fontWeight: 700 }}>
        {m.text}
      </div>
    );

    if (m.role === 'result') return (
      <div key={m.id} style={{ ...baseStyle, padding: '10px 14px', background: 'rgba(0,30,20,0.5)', border: '1px solid rgba(0,255,156,0.15)', fontSize: 11, color: '#00dbe9', whiteSpace: 'pre-wrap' }}>
        {m.text}
      </div>
    );

    if (m.role === 'error') return (
      <div key={m.id} style={{ ...baseStyle, padding: '8px 14px', background: 'rgba(40,5,5,0.7)', border: '1px solid rgba(255,0,60,0.35)', fontSize: 11, color: '#ff525c' }}>
        {m.text}
      </div>
    );

    // sys
    return (
      <div key={m.id} style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', fontStyle: 'italic' }}>
        ◦ {m.text}
      </div>
    );
  }

  /* ── Panel renderers ──────────────────────────────────────────────────── */
  function PanelButton({ label, icon, cmd }: { label: string; icon: string; cmd: string }) {
    return (
      <button
        onClick={() => { setActiveNav('uplink'); submitCommand(cmd); }}
        disabled={busy}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 6, padding: '14px 8px',
          background: 'rgba(255,0,60,0.06)', border: '1px solid rgba(255,0,60,0.2)',
          color: busy ? '#3a1818' : '#af8786', cursor: busy ? 'not-allowed' : 'pointer',
          fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.06em',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { if (!busy) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,0,60,0.15)'; (e.currentTarget as HTMLButtonElement).style.color = '#ffb3b2'; } }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,0,60,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = busy ? '#3a1818' : '#af8786'; }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'inherit' }}>{icon}</span>
        {label}
      </button>
    );
  }

  function renderAppsPanel() {
    return (
      <div style={{ padding: 16, height: '100%', overflowY: 'auto' }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.12em', marginBottom: 14 }}>
          APP_CONTROL // LAUNCH_MATRIX
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {APP_ACTIONS.map(a => <PanelButton key={a.label} {...a} />)}
        </div>
      </div>
    );
  }

  function renderHIDPanel() {
    return (
      <div style={{ padding: 16, height: '100%', overflowY: 'auto' }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.12em', marginBottom: 14 }}>
          HID_CONTROL // SCREEN_INTERFACE
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {HID_ACTIONS.map(a => <PanelButton key={a.label} {...a} />)}
        </div>
        <div style={{ marginTop: 20, fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.1em', marginBottom: 10 }}>
          TYPE_TEXT //
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="hid-type-input"
            placeholder="Text to type at cursor..."
            style={{ flex: 1, padding: '8px 12px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 11, outline: 'none' }}
            onKeyDown={e => { if (e.key === 'Enter') { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (v) { submitCommand(`type text: ${v}`); (e.currentTarget as HTMLInputElement).value = ''; } } }}
          />
          <button
            onClick={() => { const el = document.getElementById('hid-type-input') as HTMLInputElement; const v = el?.value.trim(); if (v) { submitCommand(`type text: ${v}`); el.value = ''; } }}
            style={{ padding: '8px 16px', background: 'rgba(255,0,60,0.12)', border: '1px solid rgba(255,0,60,0.3)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer' }}
          >TYPE</button>
        </div>
        <div style={{ marginTop: 16, fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.1em', marginBottom: 10 }}>
          SET_CLIPBOARD //
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="hid-clip-input"
            placeholder="Text to put in clipboard..."
            style={{ flex: 1, padding: '8px 12px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 11, outline: 'none' }}
            onKeyDown={e => { if (e.key === 'Enter') { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (v) { submitCommand(`set clipboard to: ${v}`); (e.currentTarget as HTMLInputElement).value = ''; } } }}
          />
          <button
            onClick={() => { const el = document.getElementById('hid-clip-input') as HTMLInputElement; const v = el?.value.trim(); if (v) { submitCommand(`set clipboard to: ${v}`); el.value = ''; } }}
            style={{ padding: '8px 16px', background: 'rgba(255,0,60,0.12)', border: '1px solid rgba(255,0,60,0.3)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer' }}
          >COPY</button>
        </div>
      </div>
    );
  }

  function renderFilePanel() {
    return (
      <div style={{ padding: 16, height: '100%', overflowY: 'auto' }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.12em', marginBottom: 14 }}>
          FILE_MATRIX // FILESYSTEM_INTERFACE
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            value={filePath}
            onChange={e => setFilePath(e.target.value)}
            placeholder="Path (e.g. ~/Desktop/file.txt)"
            style={{ flex: 1, padding: '8px 12px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 11, outline: 'none' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: '📂 List Desktop',  cmd: 'list files on desktop' },
            { label: '📖 Read File',     cmd: () => filePath ? `read file ${filePath}` : 'list files on desktop' },
            { label: '🗑 Delete File',   cmd: () => filePath ? `delete file ${filePath}` : null },
            { label: '📁 New Folder',    cmd: () => filePath ? `create folder ${filePath}` : null },
            { label: '📄 Create File',   cmd: () => filePath ? `create file ${filePath}` : null },
            { label: '📋 List Downloads',cmd: 'list files in downloads folder' },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => {
                const c = typeof item.cmd === 'function' ? item.cmd() : item.cmd;
                if (c) { setActiveNav('uplink'); submitCommand(c); }
              }}
              disabled={busy}
              style={{ padding: '12px', background: 'rgba(255,0,60,0.06)', border: '1px solid rgba(255,0,60,0.2)', color: '#af8786', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, textAlign: 'left' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,0,60,0.14)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,0,60,0.06)'; }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderSystemPanel() {
    return (
      <div style={{ padding: 16, height: '100%', overflowY: 'auto' }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.12em', marginBottom: 14 }}>
          SYSTEM_CLI // SHELL_INTERFACE
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
          {SYSTEM_ACTIONS.map(a => <PanelButton key={a.label} {...a} />)}
        </div>

        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.1em', marginBottom: 10 }}>
          RUN_COMMAND //
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            id="sys-cmd-input"
            placeholder="e.g.  ipconfig /all"
            style={{ flex: 1, padding: '8px 12px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 11, outline: 'none' }}
            onKeyDown={e => { if (e.key === 'Enter') { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (v) { submitCommand(`run command ${v}`); setActiveNav('uplink'); (e.currentTarget as HTMLInputElement).value = ''; } } }}
          />
          <button
            onClick={() => { const el = document.getElementById('sys-cmd-input') as HTMLInputElement; const v = el?.value.trim(); if (v) { submitCommand(`run command ${v}`); setActiveNav('uplink'); el.value = ''; } }}
            style={{ padding: '8px 16px', background: 'rgba(255,0,60,0.12)', border: '1px solid rgba(255,0,60,0.3)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer' }}
          >RUN</button>
        </div>

        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.1em', marginBottom: 10 }}>
          RUN_POWERSHELL //
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="sys-ps-input"
            placeholder="e.g.  Get-Process"
            style={{ flex: 1, padding: '8px 12px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 11, outline: 'none' }}
            onKeyDown={e => { if (e.key === 'Enter') { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (v) { submitCommand(`run powershell ${v}`); setActiveNav('uplink'); (e.currentTarget as HTMLInputElement).value = ''; } } }}
          />
          <button
            onClick={() => { const el = document.getElementById('sys-ps-input') as HTMLInputElement; const v = el?.value.trim(); if (v) { submitCommand(`run powershell ${v}`); setActiveNav('uplink'); el.value = ''; } }}
            style={{ padding: '8px 16px', background: 'rgba(255,0,60,0.12)', border: '1px solid rgba(255,0,60,0.3)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer' }}
          >RUN PS</button>
        </div>
      </div>
    );
  }

  function renderCommPanel() {
    return (
      <div style={{ padding: 16, height: '100%', overflowY: 'auto' }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.12em', marginBottom: 20 }}>
          COMMS_WEB // NETWORK_INTERFACE
        </div>

        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.1em', marginBottom: 8 }}>OPEN_URL //</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://..."
            style={{ flex: 1, padding: '8px 12px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 11, outline: 'none' }}
            onKeyDown={e => { if (e.key === 'Enter' && urlInput.trim()) { submitCommand(`open url ${urlInput.trim()}`); setActiveNav('uplink'); setUrlInput(''); } }}
          />
          <button onClick={() => { if (urlInput.trim()) { submitCommand(`open url ${urlInput.trim()}`); setActiveNav('uplink'); setUrlInput(''); } }}
            style={{ padding: '8px 16px', background: 'rgba(255,0,60,0.12)', border: '1px solid rgba(255,0,60,0.3)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer' }}
          >OPEN</button>
        </div>

        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.1em', marginBottom: 8 }}>GOOGLE_SEARCH //</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search query..."
            style={{ flex: 1, padding: '8px 12px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 11, outline: 'none' }}
            onKeyDown={e => { if (e.key === 'Enter' && searchInput.trim()) { submitCommand(`search the web for ${searchInput.trim()}`); setActiveNav('uplink'); setSearchInput(''); } }}
          />
          <button onClick={() => { if (searchInput.trim()) { submitCommand(`search the web for ${searchInput.trim()}`); setActiveNav('uplink'); setSearchInput(''); } }}
            style={{ padding: '8px 16px', background: 'rgba(255,0,60,0.12)', border: '1px solid rgba(255,0,60,0.3)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer' }}
          >SEARCH</button>
        </div>

        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.1em', marginBottom: 8 }}>QUICK_OPEN //</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: '🔍 Google',   cmd: 'open https://www.google.com'  },
            { label: '▶ YouTube',  cmd: 'open https://www.youtube.com' },
            { label: '💻 GitHub',  cmd: 'open https://github.com'      },
            { label: '📰 Reddit',  cmd: 'open https://www.reddit.com'  },
          ].map(item => (
            <button key={item.label}
              onClick={() => { submitCommand(item.cmd); setActiveNav('uplink'); }}
              style={{ padding: '12px', background: 'rgba(255,0,60,0.06)', border: '1px solid rgba(255,0,60,0.2)', color: '#af8786', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, textAlign: 'left' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,0,60,0.14)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,0,60,0.06)'; }}
            >{item.label}</button>
          ))}
        </div>
      </div>
    );
  }

  function renderCenterPanel() {
    switch (activeNav) {
      case 'apps':   return renderAppsPanel();
      case 'input':  return renderHIDPanel();
      case 'file':   return renderFilePanel();
      case 'system': return renderSystemPanel();
      case 'comm':   return renderCommPanel();
      default:       return null;
    }
  }

  /* ─── Main render ─────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: '#0d0505' }}>

      {/* ═══ CLEAR MODAL ══════════════════════════════════════════════ */}
      {showClearModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ padding: 32, background: '#150808', border: '1px solid rgba(255,0,60,0.35)', fontFamily: 'JetBrains Mono', maxWidth: 380, width: '90%' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#ffb3b2', marginBottom: 10 }}>CLEAR MEMORY + CHAT?</div>
            <div style={{ fontSize: 11, color: '#9a7070', marginBottom: 24 }}>This will erase all conversation history and agent memory. Cannot be undone.</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={clearAll} style={{ flex: 1, padding: '10px', background: 'rgba(255,0,60,0.15)', border: '1px solid rgba(255,0,60,0.4)', color: '#ff525c', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700 }}>CONFIRM</button>
              <button onClick={() => setShowClearModal(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(154,112,112,0.4)', color: '#9a7070', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 11 }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TITLE BAR ════════════════════════════════════════════════ */}
      <div className="flex-shrink-0 flex items-center justify-between px-4"
           style={{ height: 34, background: '#150808', borderBottom: '1px solid rgba(255,0,60,0.25)' }}>
        <div className="flex items-center gap-2">
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF003C', boxShadow: '0 0 6px #FF003C' }} />
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: '#ffb3b2', letterSpacing: '0.15em' }}>
            RAGE // COMMAND_OS
          </span>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#7a5555', letterSpacing: '0.05em', marginLeft: 8 }}>
            v2.0
          </span>
        </div>

        {/* ── LLM Provider Dropdown ── */}
        <div className="flex items-center gap-2" style={{ fontFamily: 'JetBrains Mono', fontSize: 9 }}>
          <span style={{ color: '#9a7070', letterSpacing: '0.08em' }}>LLM_PROVIDER:</span>
          <select
            value={activeProvider}
            onChange={handleProviderChange}
            style={{
              background: '#1b0909', border: '1px solid rgba(255,0,60,0.3)', color: '#ffb3b2',
              fontFamily: 'JetBrains Mono', fontSize: 9, padding: '2px 6px', cursor: 'pointer',
              letterSpacing: '0.06em', outline: 'none',
            }}
          >
            {providers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* save chat log */}
          <button
            title="Save chat log to clipboard"
            onClick={saveChatLog}
            className="material-symbols-outlined"
            style={{ fontSize: 15, color: '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#00dbe9'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
          >download</button>
          {/* clear memory */}
          <button
            title="Clear memory & chat"
            onClick={() => setShowClearModal(true)}
            className="material-symbols-outlined"
            style={{ fontSize: 15, color: '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ff525c'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
          >delete_sweep</button>
          {/* close window */}
          <button
            title="Close window"
            onClick={closeWindow}
            className="material-symbols-outlined"
            style={{ fontSize: 15, color: '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ff525c'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
          >power_settings_new</button>
        </div>
      </div>

      {/* ═══ BODY ═════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR ─────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex flex-col"
             style={{ width: 176, background: '#100606', borderRight: '1px solid rgba(255,0,60,0.18)' }}>

          {/* Logo */}
          <div className="flex items-center gap-3 p-4" style={{ borderBottom: '1px solid rgba(255,0,60,0.18)' }}>
            <div className="relative flex items-center justify-center flex-shrink-0"
                 style={{ width: 36, height: 36, background: 'rgba(255,0,60,0.12)', border: '1px solid rgba(255,0,60,0.45)' }}>
              <div className="pulse-ring absolute inset-0" style={{ border: '1px solid rgba(255,0,60,0.5)' }} />
              <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 16, color: '#FF003C' }}>R</span>
            </div>
            <div>
              <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 18, color: '#FF003C', lineHeight: 1 }}>RAGE</div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: '#8a6060', letterSpacing: '0.04em', marginTop: 2 }}>
                SYSTEM_V2.0
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-3 px-2 space-y-1">
            {NAV_ITEMS.map(item => (
              <div key={item.id}
                   className={`nav-item${activeNav === item.id ? ' active' : ''}`}
                   onClick={() => setActiveNav(item.id)}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: activeNav === item.id ? '#FF003C' : '#8a6060' }}>
                  {item.icon}
                </span>
                {item.label}
              </div>
            ))}
          </nav>

          {/* Override / Ctrl+K hint */}
          <div className="p-3" style={{ borderTop: '1px solid rgba(255,0,60,0.18)' }}>
            <button
              className="btn-crimson cyber-chamfer-sm w-full text-center"
              style={{ padding: '10px 8px', fontSize: 9, letterSpacing: '0.1em' }}
              onClick={() => submitCommand('system override — perform a comprehensive system health check and report all critical metrics')}
              disabled={busy}
            >
              <div className="sweep" />
              INITIATE_OVERRIDE
            </button>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: '#7a5555', textAlign: 'center', marginTop: 8 }}>
              CTRL+K → FOCUS INPUT
            </div>
          </div>
        </div>

        {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Top Stats Bar */}
          <div className="flex-shrink-0 flex items-center justify-between px-6"
               style={{ height: 38, background: '#150808', borderBottom: '1px solid rgba(255,0,60,0.18)' }}>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2" style={{ fontFamily: 'JetBrains Mono', fontSize: 11 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#9a7070' }}>developer_board</span>
                <span style={{ color: '#9a7070' }}>CPU:</span>
                <span style={{ color: '#ff525c', fontWeight: 700 }}>{cpuVal}</span>
              </div>
              <div className="flex items-center gap-2" style={{ fontFamily: 'JetBrains Mono', fontSize: 11 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#9a7070' }}>memory</span>
                <span style={{ color: '#9a7070' }}>RAM:</span>
                <span style={{ color: '#00dbe9', fontWeight: 700 }}>{ramVal}</span>
              </div>
              <div className="flex items-center gap-1" style={{ fontFamily: 'JetBrains Mono', fontSize: 11 }}>
                <span style={{ color: '#19ff9d', fontSize: 16 }}>⬡</span>
                <span style={{ color: '#19ff9d', fontWeight: 700, letterSpacing: '0.05em' }}>
                  {syncStatus === 'ONLINE' ? 'UPLINK_STABLE' : 'CALIBRATING'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* system diagnostics */}
              <button
                title="Get system info (CPU / RAM / Disk)"
                onClick={() => submitCommand('get system info cpu ram and disk')}
                className="material-symbols-outlined"
                style={{ fontSize: 15, color: '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ffb3b2'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
              >monitoring</button>
              {/* set reminder */}
              <button
                title="Set a timed reminder"
                onClick={() => { const msg = prompt('Reminder message?'); if (msg) submitCommand(`set reminder: ${msg} in 60 seconds`); }}
                className="material-symbols-outlined"
                style={{ fontSize: 15, color: '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ffb3b2'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
              >alarm</button>
              {/* clear chat */}
              <button
                title="Clear chat & memory"
                onClick={() => setShowClearModal(true)}
                className="material-symbols-outlined"
                style={{ fontSize: 15, color: '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ff525c'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
              >playlist_remove</button>
            </div>
          </div>

          {/* Content Row */}
          <div className="flex flex-1 overflow-hidden">

            {/* Center: Globe or Panel */}
            <div className="flex flex-col overflow-hidden flex-1" style={{ borderRight: '1px solid rgba(255,0,60,0.18)' }}>
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2"
                   style={{ background: '#100606', borderBottom: '1px solid rgba(255,0,60,0.12)' }}>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: '#ffb3b2', letterSpacing: '0.15em' }}>
                  {activeNav === 'uplink' ? 'ENTITY_VISUALIZATION' :
                   activeNav === 'apps'   ? 'APP_CONTROL' :
                   activeNav === 'input'  ? 'HID_SCREEN' :
                   activeNav === 'file'   ? 'FILE_MATRIX' :
                   activeNav === 'system' ? 'SYSTEM_CLI' : 'COMMS_WEB'}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#7a5555' }}>0xRAGE_CORE</span>
              </div>

              {activeNav === 'uplink' ? (
                <>
                  <div className="flex-shrink-0 px-4 py-2" style={{ borderBottom: '1px solid rgba(255,0,60,0.08)', background: '#0d0505' }}>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: syncStatus === 'ONLINE' ? '#19ff9d' : '#00dbe9' }}>
                      SYNC: {syncStatus}
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#9a7070', marginTop: 3 }}>
                      ANOMALY DETECTED [{syncStatus === 'ONLINE' ? '0x00' : '0x88'}] · PROVIDER: {activeProvider}
                    </div>
                  </div>
                  <div className="flex-1 relative overflow-hidden" style={{ background: '#0a0303' }}>
                    <GlobeCanvas onReady={onGlobeReady} />
                    <div className="absolute inset-0 scanline-overlay opacity-15 pointer-events-none" style={{ zIndex: 5 }} />
                  </div>
                </>
              ) : (
                <div className="flex-1 overflow-hidden" style={{ background: '#0d0505' }}>
                  {renderCenterPanel()}
                </div>
              )}
            </div>

            {/* Right: Chat panel */}
            <div className="flex flex-col overflow-hidden flex-shrink-0" style={{ width: 420 }}>

              {/* Chat header */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2"
                   style={{ background: '#100606', borderBottom: '1px solid rgba(255,0,60,0.12)' }}>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: '#ffb3b2', letterSpacing: '0.15em' }}>
                  COMMUNICATION_LOG
                </span>
                <div className="flex items-center gap-2">
                  <button
                    title="Copy chat log to clipboard"
                    onClick={saveChatLog}
                    className="material-symbols-outlined"
                    style={{ fontSize: 13, color: '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#00dbe9'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
                  >sim_card_download</button>
                  <div className="flex items-center gap-1" style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#8a6060' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 11 }}>lock</span>
                    ENCRYPTED
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ background: '#0d0505' }}>
                {msgs.map(renderMsg)}
                {/* Typing indicator */}
                {busy && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'JetBrains Mono', fontSize: 10, color: '#af8786' }}>
                    <span style={{ animation: 'pulse 1s infinite' }}>◦</span>
                    <span style={{ animation: 'pulse 1s 0.3s infinite' }}>◦</span>
                    <span style={{ animation: 'pulse 1s 0.6s infinite' }}>◦</span>
                    <span style={{ marginLeft: 4 }}>PROCESSING...</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Processing bar */}
              {busy && (
                <div style={{ height: 2, background: '#1b0909', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                  <div className="scan-across absolute"
                       style={{ width: '50%', height: '100%', background: 'linear-gradient(to right, transparent, #00FF9C, transparent)' }} />
                </div>
              )}

              {/* ── Quick action chips — 2-row wrap so all chips are visible ── */}
              <div className="flex-shrink-0" style={{ borderTop: '1px solid rgba(255,0,60,0.1)', background: '#100606' }}>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 7, color: '#9a7070', letterSpacing: '0.1em', padding: '5px 12px 3px' }}>
                  QUICK_ACTIONS //
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '4px 8px 8px' }}>
                  {QUICK_CHIPS.map((chip, i) => (
                    <button
                      key={i}
                      onClick={() => submitCommand(chip.cmd)}
                      disabled={busy}
                      title={chip.cmd}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '5px 10px',
                        fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.06em',
                        color: busy ? '#5a3535' : '#c49090',
                        background: 'rgba(255,0,60,0.07)', border: '1px solid rgba(255,0,60,0.22)',
                        cursor: busy ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { if (!busy) { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'rgba(255,0,60,0.18)'; b.style.color = '#ffb3b2'; b.style.borderColor = 'rgba(255,0,60,0.5)'; } }}
                      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'rgba(255,0,60,0.07)'; b.style.color = busy ? '#5a3535' : '#c49090'; b.style.borderColor = 'rgba(255,0,60,0.22)'; }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{chip.icon}</span>
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input */}
              <div className="flex-shrink-0 flex items-center gap-3 px-4"
                   style={{ height: 56, background: '#100606', borderTop: '1px solid rgba(255,0,60,0.2)' }}>
                {/* Mic button */}
                <button
                  title="Voice input"
                  onClick={toggleMic}
                  className="material-symbols-outlined flex-shrink-0"
                  style={{
                    fontSize: 20, background: 'none', border: 'none', cursor: 'pointer',
                    color: micActive ? '#FF003C' : '#8a6060',
                    animation: micActive ? 'pulse 0.8s infinite' : 'none',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => { if (!micActive) (e.currentTarget as HTMLButtonElement).style.color = '#ffb3b2'; }}
                  onMouseLeave={e => { if (!micActive) (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
                >mic</button>

                <div className="flex items-center flex-1" style={{ borderBottom: '1px solid rgba(154,112,112,0.5)', paddingBottom: 4 }}>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: '#8a6060', marginRight: 6 }}>&gt;</span>
                  <input
                    ref={inputRef}
                    className="cmd-input"
                    placeholder={micActive ? 'LISTENING...' : 'ENTER_COMMAND... (↑↓ history)'}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={busy}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>

                <button
                  onClick={() => submitCommand()}
                  disabled={busy}
                  className="cyber-chamfer-sm flex items-center gap-2 flex-shrink-0"
                  style={{
                    padding: '8px 14px', fontFamily: 'JetBrains Mono', fontSize: 10,
                    fontWeight: 700, letterSpacing: '0.1em',
                    color: busy ? '#3a1818' : '#ffb3b2',
                    background: '#1b0909', border: '1px solid rgba(255,179,178,0.25)',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!busy) { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'rgba(255,0,60,0.15)'; b.style.borderColor = 'rgba(255,0,60,0.5)'; } }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#1b0909'; b.style.borderColor = 'rgba(255,179,178,0.25)'; }}
                >
                  SEND
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
