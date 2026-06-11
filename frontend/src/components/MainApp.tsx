import { useState, useRef, useEffect, useCallback } from 'react';
import GlobeCanvas from './GlobeCanvas';

/* ─── pywebview type declarations ─────────────────────────────────────────── */
declare global {
  interface Window {
    pywebview?: {
      api: {
        ask_llm: (c: string) => Promise<{ action: string; full: Record<string, unknown>; result: string } | null>;
        execute_action: (a: string, confirmed?: boolean) => Promise<string>;
        clear_memory: () => Promise<string>;
        get_providers: () => Promise<string[]>;
        set_provider: (n: string) => Promise<string>;
        get_active_provider: () => Promise<string>;
        get_system_info_quick: () => Promise<{ cpu: number | string; ram_used: number | string; ram_total: number | string; ram_pct: number | string }>;
        save_chat_log: (t: string) => Promise<string>;
        download_chat_log?: (t: string) => Promise<string>;
        close_window: () => Promise<void>;
        minimize_window: () => Promise<void>;
        listen: () => Promise<string>;
        toggle_fullscreen: () => Promise<boolean>;
        is_fullscreen: () => Promise<boolean>;
        report_feedback: (f: string) => Promise<string>;
        get_tool_suggestions: () => Promise<string>;
        mark_tool_suggested: (a: string) => Promise<string>;
        get_sandbox_mode: () => Promise<boolean>;
        set_sandbox_mode: (e: boolean) => Promise<string>;
        is_startup_enabled: () => Promise<boolean>;
        set_startup_enabled: (e: boolean) => Promise<string>;
        get_macros: () => Promise<string>;
        delete_macro: (n: string) => Promise<string>;
        save_macro: (n: string, s: string[]) => Promise<string>;
        edit_macro_via_prompt: (n: string, i: string) => Promise<string>;
        get_sequence_suggestions: () => Promise<string>;
        dismiss_sequence_suggestion: (s: string[]) => Promise<string>;
        get_memory_db_stats: () => Promise<string>;
        get_memory_history: () => Promise<string>;
        get_memory_log: () => Promise<string>;
        get_profile: () => Promise<string>;
        set_profile: (field: string, value: string) => Promise<string>;
        set_profile_batch: (profileJson: string) => Promise<string>;
      };
    };
    onClipboardNotification?: (payload: { text: string; type: 'url' | 'path' }) => void;
    onFileOrganized?: (payload: { filename: string; category: string; destination: string }) => void;
    onWindowsNotification?: (payload: { app: string; title: string; body: string }) => void;
    onSettingsChanged?: () => void;
    addMessageFromPython?: (role: any, text: string) => void;
  }
}

/* ─── Types ────────────────────────────────────────────────────────────────── */
type Role = 'rage' | 'user' | 'result' | 'error' | 'action' | 'sys';
interface Msg { id: number; role: Role; text: string; ts: string; command?: string; action_taken?: any; }
type PanelId = 'uplink' | 'apps' | 'input' | 'file' | 'system' | 'comm';
type ToneId =
  | 'professional'
  | 'sarcastic'
  | 'corny'
  | 'simple'
  | 'nerd'
  | 'military'
  | 'poetic'
  | 'hype_man'
  | 'deadpan'
  | 'villain'
  | 'storyteller'
  | 'zen_coach'
  | 'mission_control'
  | 'custom';
interface UserProfile {
  name: string;
  role: string;
  interests: string;
  tone: ToneId;
  custom_tone_prompt: string;
  agent_name: string;
}

/* ─── Constants ────────────────────────────────────────────────────────────── */
const NAV_ITEMS: { id: PanelId; icon: string; label: string }[] = [
  { id: 'uplink', icon: 'radar', label: 'Core Uplink' },
  { id: 'apps', icon: 'apps', label: 'App Control' },
  { id: 'input', icon: 'keyboard', label: 'HID & Screen' },
  { id: 'file', icon: 'folder_open', label: 'File Matrix' },
  { id: 'system', icon: 'terminal', label: 'System CLI' },
  { id: 'comm', icon: 'travel_explore', label: 'Comms & Web' },
];

const QUICK_CHIPS: { label: string; icon: string; cmd: string }[] = [
  { label: 'Screenshot', icon: 'screenshot', cmd: 'take a screenshot and save it to my desktop' },
  { label: 'Sys Info', icon: 'memory', cmd: 'get system info cpu ram and disk' },
  { label: 'Clipboard', icon: 'content_paste', cmd: 'get clipboard contents' },
  { label: 'Google', icon: 'language', cmd: 'open https://www.google.com' },
  { label: 'Explorer', icon: 'folder_open', cmd: 'open explorer' },
  { label: 'Notepad', icon: 'edit_note', cmd: 'open notepad' },
  { label: 'Volume 70%', icon: 'volume_up', cmd: 'set volume to 70' },
  { label: 'Task Mgr', icon: 'monitor_heart', cmd: 'open task manager' },
];

/* ─── Panel action button groups ──────────────────────────────────────────── */
const APP_ACTIONS = [
  { label: 'Notepad', icon: 'edit_note', cmd: 'open notepad' },
  { label: 'Calculator', icon: 'calculate', cmd: 'open calculator' },
  { label: 'Explorer', icon: 'folder_open', cmd: 'open explorer' },
  { label: 'Chrome', icon: 'language', cmd: 'open chrome' },
  { label: 'Task Manager', icon: 'monitor_heart', cmd: 'open task manager' },
  { label: 'VS Code', icon: 'code', cmd: 'open vs code' },
  { label: 'Spotify', icon: 'music_note', cmd: 'open spotify' },
  { label: 'Discord', icon: 'forum', cmd: 'open discord' },
  { label: 'Paint', icon: 'palette', cmd: 'open paint' },
  { label: 'PowerShell', icon: 'terminal', cmd: 'open powershell' },
  { label: 'Brave', icon: 'security', cmd: 'open brave' },
  { label: 'Edge', icon: 'edge', cmd: 'open edge' },
];

const HID_ACTIONS = [
  { label: 'Screenshot', icon: 'screenshot', cmd: 'take a screenshot and save it to my desktop' },
  { label: 'Clipboard Get', icon: 'content_paste', cmd: 'get clipboard contents' },
  { label: 'Scroll Down', icon: 'expand_more', cmd: 'scroll down 3' },
  { label: 'Scroll Up', icon: 'expand_less', cmd: 'scroll up 3' },
  { label: 'Vol Up', icon: 'volume_up', cmd: 'set volume to 80' },
  { label: 'Vol Down', icon: 'volume_down', cmd: 'set volume to 40' },
  { label: 'Mute', icon: 'volume_off', cmd: 'set volume to 0' },
  { label: 'Active Window', icon: 'open_in_full', cmd: 'get active window' },
];

const SYSTEM_ACTIONS = [
  { label: 'Sys Info', icon: 'info', cmd: 'get system info cpu ram and disk' },
  { label: 'IP Config', icon: 'wifi', cmd: 'run command ipconfig' },
  { label: 'Process List', icon: 'list', cmd: 'run powershell Get-Process | Select-Object Name, CPU | Sort-Object CPU -Descending | Select-Object -First 15' },
  { label: 'Disk Usage', icon: 'storage', cmd: 'run powershell Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free' },
  { label: 'Services', icon: 'settings_suggest', cmd: 'run powershell Get-Service | Where-Object {$_.Status -eq "Running"} | Select-Object -First 20 DisplayName' },
  { label: 'Network', icon: 'network_check', cmd: 'run command netstat -an | findstr ESTABLISHED' },
];

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const ts = () => new Date().toLocaleTimeString('en-US', { hour12: false });
const apiAvailable = () => !!window.pywebview?.api;

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function MainApp() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [activeNav, setActiveNav] = useState<PanelId>('uplink');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState('CALIBRATING...');
  const [cpuVal, setCpuVal] = useState<string>('--.--%');
  const [ramVal, setRamVal] = useState<string>('--GB');
  const [providers, setProviders] = useState<string[]>(['Auto (Fallback)']);
  const [activeProvider, setActiveProvider] = useState('Auto (Fallback)');
  const [micActive, setMicActive] = useState(false);
  const [showClearChatModal, setShowClearChatModal] = useState(false);
  const [showClearMemoryModal, setShowClearMemoryModal] = useState(false);
  const [showMicModal, setShowMicModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [feedbackStates, setFeedbackStates] = useState<Record<number, { correct: boolean | null; showInput: boolean; inputValue: string }>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const msgCounter = useRef(0);
  const historyBuf = useRef<string[]>([]);
  const historyIdx = useRef(-1);
  const lastActionRef = useRef<Record<string, unknown> | null>(null);
  const lastCommandRef = useRef<string>('');
  const isSubmittingRef = useRef(false);
  // File panel state
  const [filePath, setFilePath] = useState('');
  // Comm panel state
  const [urlInput, setUrlInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [toolSuggestions, setToolSuggestions] = useState<any[]>([]);
  const [sequenceSuggestions, setSequenceSuggestions] = useState<any[]>([]);

  // Settings and System Watcher states
  const [sandboxMode, setSandboxMode] = useState(false);
  const [startupEnabled, setStartupEnabled] = useState(false);
  const [macros, setMacros] = useState<Record<string, string[]>>({});
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'settings' | 'memory' | 'profile'>('profile');
  const [memoryStats, setMemoryStats] = useState<Record<string, number>>({});
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderMsg, setReminderMsg] = useState('');
  const [reminderSeconds, setReminderSeconds] = useState(60);
  const [memoryHistory, setMemoryHistory] = useState<any[]>([]);
  const [memoryLog, setMemoryLog] = useState<any[]>([]);

  // Custom confirmation modal for deletes
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState('');
  const [pendingAction, setPendingAction] = useState<any>(null);

  // Macro Edit sub-modal states
  const [showEditMacroModal, setShowEditMacroModal] = useState(false);
  const [editMacroName, setEditMacroName] = useState('');
  const [editMacroInstruction, setEditMacroInstruction] = useState('');
  const [editMacroBusy, setEditMacroBusy] = useState(false);
  const [editMacroError, setEditMacroError] = useState('');

  // Clipboard/file/notification Toasts
  const [toasts, setToasts] = useState<{ id: number; type: 'clipboard' | 'file' | 'notification'; title: string; body: string; actionCmd?: string }[]>([]);

  // ── Personalization Profile ─────────────────────────────────────────────
  const defaultProfile: UserProfile = {
    name: '', role: '', interests: '', tone: 'professional', custom_tone_prompt: '', agent_name: 'JARVIS',
  };
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [profileDraft, setProfileDraft] = useState<UserProfile>(defaultProfile);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  /* ── Poll for missing tool suggestions ────────────────────────────── */
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (apiAvailable() && window.pywebview?.api?.get_tool_suggestions) {
        try {
          const res = await window.pywebview.api.get_tool_suggestions();
          const suggestions = JSON.parse(res);
          setToolSuggestions(suggestions);
        } catch (e) {
          // ignore
        }
      }
    };
    fetchSuggestions();
    const id = setInterval(fetchSuggestions, 15000);
    return () => clearInterval(id);
  }, []);

  /* ── Poll for sequence suggestions ────────────────────────────── */
  useEffect(() => {
    const fetchSeqSuggestions = async () => {
      if (apiAvailable() && window.pywebview?.api?.get_sequence_suggestions) {
        try {
          const res = await window.pywebview.api.get_sequence_suggestions();
          const suggestions = JSON.parse(res);
          setSequenceSuggestions(suggestions);
        } catch (e) {
          // ignore
        }
      }
    };
    fetchSeqSuggestions();
    const id = setInterval(fetchSeqSuggestions, 15000);
    return () => clearInterval(id);
  }, []);

  /* ── Add message ──────────────────────────────────────────────────────── */
  const addMsg = useCallback((role: Role, text: string, command?: string, action_taken?: any) => {
    setMsgs(prev => [...prev, { id: ++msgCounter.current, role, text, ts: ts(), command, action_taken }]);
  }, []);

  const fetchSettings = useCallback(async () => {
    if (apiAvailable()) {
      try {
        const sb = await window.pywebview!.api.get_sandbox_mode();
        setSandboxMode(sb);
        const se = await window.pywebview!.api.is_startup_enabled();
        setStartupEnabled(se);
        const msStr = await window.pywebview!.api.get_macros();
        setMacros(JSON.parse(msStr));
      } catch (e) {
        console.error("Error fetching settings:", e);
      }
    }
  }, []);

  const fetchProfile = useCallback(async () => {
    if (apiAvailable() && window.pywebview?.api?.get_profile) {
      try {
        const pStr = await window.pywebview.api.get_profile();
        const p = JSON.parse(pStr) as UserProfile;
        setProfile(p);
        setProfileDraft(p);
      } catch (e) {
        console.error('Error fetching profile:', e);
      }
    }
  }, []);

  const fetchMemoryData = useCallback(async () => {
    if (apiAvailable()) {
      try {
        const [statsStr, histStr, logStr] = await Promise.all([
          window.pywebview!.api.get_memory_db_stats(),
          window.pywebview!.api.get_memory_history(),
          window.pywebview!.api.get_memory_log(),
        ]);
        setMemoryStats(JSON.parse(statsStr));
        setMemoryHistory(JSON.parse(histStr));
        setMemoryLog(JSON.parse(logStr));
      } catch (e) {
        console.error("Error fetching memory data:", e);
      }
    }
  }, []);

  /* ── Init ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const greetingName = profile.name || '';
    const agentName = profile.agent_name || 'R.A.G.E.';
    const greeting = greetingName
      ? `${agentName} uplink established. Welcome back, ${greetingName}. Neural core synchronized. All systems operational.`
      : `${agentName} uplink established. Neural core synchronized. All systems operational. I have preemptively optimized your session parameters. You may proceed.`;
    addMsg('rage', greeting);
    addMsg('sys', 'Connected to pywebview API — full execution mode active.');

    // Load providers
    if (apiAvailable()) {
      window.pywebview!.api.get_providers().then(p => {
        setProviders(p);
      }).catch(() => { });
      window.pywebview!.api.get_active_provider().then(p => {
        setActiveProvider(p);
      }).catch(() => { });
      fetchSettings();
      fetchProfile();
    }
  }, [fetchSettings, fetchProfile]);

  // Subscribe to background hooks and event changes
  useEffect(() => {
    fetchSettings();
    window.onSettingsChanged = () => {
      fetchSettings();
    };

    let toastCounter = 0;
    const addToast = (type: 'clipboard' | 'file' | 'notification', title: string, body: string, actionCmd?: string) => {
      const id = ++toastCounter;
      setToasts(prev => [...prev, { id, type, title, body, actionCmd }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 6000);
    };

    window.onClipboardNotification = (payload: { text: string; type: 'url' | 'path' }) => {
      if (payload.type === 'url') {
        addToast('clipboard', 'Clipboard Link Copied', `I see you copied a URL: ${payload.text}`, `open url ${payload.text}`);
      } else {
        addToast('clipboard', 'Clipboard Path Copied', `I see you copied a path: ${payload.text}`, `open explorer ${payload.text}`);
      }
    };

    window.onFileOrganized = (payload: { filename: string; category: string; destination: string }) => {
      addToast('file', 'Downloads Folder Organized', `Moved ${payload.filename} into ${payload.category} folder.`);
    };

    window.onWindowsNotification = (payload: { app: string; title: string; body: string }) => {
      addToast('notification', `System Notification: ${payload.app}`, `${payload.title}\n${payload.body}`);
    };

    window.addMessageFromPython = (role: Role, text: string) => {
      addMsg(role, text);
    };

    return () => {
      window.onSettingsChanged = undefined;
      window.onClipboardNotification = undefined;
      window.onFileOrganized = undefined;
      window.onWindowsNotification = undefined;
      window.addMessageFromPython = undefined;
    };
  }, [fetchSettings, addMsg]);

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
      }).catch(() => { });
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
    if (!raw || busy || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    if (!cmd) setInput('');
    setBusy(true);
    historyBuf.current.unshift(raw);
    historyIdx.current = -1;
    addMsg('user', raw);

    if (!apiAvailable()) {
      await new Promise(r => setTimeout(r, 600));
      addMsg('sys', '⚠ Demo mode — PyWebView API not available. Run via python webview_app.py');
      setBusy(false);
      isSubmittingRef.current = false;
      return;
    }

    try {
      const res = await window.pywebview!.api.ask_llm(raw);
      if (res?.action) {
        addMsg('action', `⚡ ACTION → ${res.action}`);
        lastActionRef.current = res.full || { action: res.action };
        lastCommandRef.current = raw;

        // Check if destructive action requires confirmation
        if (res.action === 'delete_file' || res.action === 'delete_folder') {
          const path = (res.full as any)?.path || (res.full as any)?.value || 'unknown path';
          setConfirmMsg(`Are you sure you want to delete this ${res.action === 'delete_file' ? 'file' : 'folder'}?\n\nPath: ${path}`);
          setPendingAction(res.action);
          setShowConfirmModal(true);
          setBusy(false);
          isSubmittingRef.current = false;
          return;
        }

        const result = await window.pywebview!.api.execute_action(res.action);
        if (result.toLowerCase().startsWith('error')) {
          addMsg('error', result, lastCommandRef.current || undefined, lastActionRef.current || undefined);
        } else {
          addMsg('result', result, lastCommandRef.current || undefined, lastActionRef.current || undefined);
        }
      } else {
        lastActionRef.current = null;
        addMsg('error', 'Command parsing failed — all LLM providers offline or unresponsive.');
      }
    } catch (e: any) {
      lastActionRef.current = null;
      addMsg('error', 'CRITICAL ERROR: ' + (e?.message ?? String(e)));
    }
    setBusy(false);
    isSubmittingRef.current = false;
  }

  async function handleConfirmDestructive() {
    setShowConfirmModal(false);
    if (!pendingAction || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setBusy(true);
    try {
      // Pass confirmed=true so backend destructive guard allows execution
      const result = await window.pywebview!.api.execute_action(pendingAction, true);
      if (result.toLowerCase().startsWith('error')) {
        addMsg('error', result, lastCommandRef.current || undefined, lastActionRef.current || undefined);
      } else {
        addMsg('result', result, lastCommandRef.current || undefined, lastActionRef.current || undefined);
      }
    } catch (e: any) {
      addMsg('error', 'CRITICAL ERROR: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
      isSubmittingRef.current = false;
      setPendingAction(null);
    }
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
      }).catch(() => { });
    }
  }

  /* ── Mic / Voice input ────────────────────────────────────────────────── */
  async function toggleMic(forceAuthorized = false) {
    if (micActive) return;

    if (!forceAuthorized && localStorage.getItem('rage_mic_perm') !== 'true') {
      setShowMicModal(true);
      return;
    }

    if (apiAvailable() && window.pywebview?.api?.listen) {
      setMicActive(true);
      try {
        const text = await window.pywebview.api.listen();
        if (text && !text.startsWith("Error:")) {
          setInput('');  // clear any previous typed input
          submitCommand(text); // automatically submit
        } else if (text?.startsWith("Error:")) {
          addMsg('error', text);
        }
      } catch (err: any) {
        addMsg('error', `Voice input failed: ${err.message}`);
      } finally {
        setMicActive(false);
      }
    } else {
      // Fallback for browser testing
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        addMsg('sys', '⚠ Web Speech API / Backend Listen not available.');
        return;
      }
      setMicActive(true);
      const rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.onresult = (ev: any) => {
        const transcript = ev.results[0][0].transcript;
        setInput('');
        submitCommand(transcript);
        setMicActive(false);
      };
      rec.onerror = () => setMicActive(false);
      rec.onend = () => setMicActive(false);
      rec.start();
    }
  }

  /* ── Global Keydown Listener (Fullscreen escape hatch) ────────────────── */
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        toggleFullscreen();
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isFullscreen]);

  /* ── Toggle fullscreen ──────────────────────────────────────────────── */
  async function toggleFullscreen() {
    if (apiAvailable() && window.pywebview?.api.toggle_fullscreen) {
      await window.pywebview.api.toggle_fullscreen();
      setIsFullscreen(f => !f);
    } else {
      // Dev mode fallback
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => { });
        setIsFullscreen(true);
      } else {
        document.exitFullscreen().catch(() => { });
        setIsFullscreen(false);
      }
    }
  }

  /* ── Window Controls ────────────────────────────────────────────────── */
  function minimizeWindow() {
    if (apiAvailable() && window.pywebview?.api.minimize_window) {
      window.pywebview.api.minimize_window();
    }
  }

  function closeWindow() {
    if (apiAvailable() && window.pywebview?.api.close_window) {
      window.pywebview.api.close_window();
    } else {
      window.close();
    }
  }

  /* ── Save/Copy chat log ────────────────────────────────────────────────── */
  function copyChatLog() {
    const text = msgs.map(m => `[${m.ts}] ${m.role.toUpperCase()}: ${m.text}`).join('\n');
    if (apiAvailable()) {
      window.pywebview!.api.save_chat_log(text).then(msg => addMsg('sys', msg)).catch(() => { });
    } else {
      navigator.clipboard.writeText(text).then(() => addMsg('sys', 'Chat log copied to clipboard.'));
    }
  }

  function downloadChatLog() {
    const text = msgs.map(m => `[${m.ts}] ${m.role.toUpperCase()}: ${m.text}`).join('\n');
    if (apiAvailable() && window.pywebview!.api.download_chat_log) {
      window.pywebview!.api.download_chat_log(text).then(msg => addMsg('sys', msg)).catch(() => { });
    } else {
      const element = document.createElement("a");
      const file = new Blob([text], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      element.download = "rage_chat_log.txt";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      addMsg('sys', 'Chat log download initiated.');
    }
  }

  /* ── Clear memory / chat ──────────────────────────────────────────────── */
  function clearChatOnly() {
    setMsgs([]);
    addMsg('sys', 'Chat history cleared. Personalization memory was preserved.');
    setShowClearChatModal(false);
  }

  async function clearMemoryOnly() {
    if (apiAvailable()) await window.pywebview!.api.clear_memory();
    addMsg('sys', 'Agent LLM conversation memory context cleared.');
    setShowClearMemoryModal(false);
  }

  function handleSetReminderSubmit() {
    if (!reminderMsg.trim()) return;
    submitCommand(`set reminder: ${reminderMsg.trim()} in ${reminderSeconds} seconds`);
    setShowReminderModal(false);
    setReminderMsg('');
  }

  async function handleEditMacro() {
    if (!editMacroName || !editMacroInstruction.trim() || editMacroBusy) return;
    setEditMacroBusy(true);
    setEditMacroError('');
    try {
      if (apiAvailable()) {
        const res = await window.pywebview!.api.edit_macro_via_prompt(editMacroName, editMacroInstruction.trim());
        if (res.startsWith("Error")) {
          setEditMacroError(res);
        } else {
          setShowEditMacroModal(false);
          setEditMacroInstruction('');
          fetchSettings();
          addMsg('sys', `Macro '${editMacroName}' updated successfully via prompt.`);
        }
      } else {
        setEditMacroError("API not available in demo mode.");
      }
    } catch (e: any) {
      setEditMacroError(e?.message ?? String(e));
    } finally {
      setEditMacroBusy(false);
    }
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

    if (m.role === 'result' || m.role === 'error') {
      const fb = feedbackStates[m.id];
      const isVoted = fb?.correct === true || fb?.correct === false;
      const associatedCommand = m.command || lastCommandRef.current;
      const associatedAction = m.action_taken || lastActionRef.current;

      // Detect special warning/safety conditions
      const isSafetyBlock = m.text.includes("Blocked:") || m.text.includes("Dangerous");
      const isOperatorAbort = m.text.includes("Action Aborted") || m.text.includes("cancelled by user");
      const isEmergencyStop = m.text.includes("Emergency Stop");

      if (isSafetyBlock) {
        return (
          <div key={m.id} style={{
            fontFamily: 'JetBrains Mono',
            margin: '8px 0',
            padding: '12px 16px',
            background: 'rgba(255, 0, 60, 0.08)',
            borderLeft: '4px solid #FF003C',
            borderRight: '1px solid rgba(255, 0, 60, 0.2)',
            borderTop: '1px solid rgba(255, 0, 60, 0.2)',
            borderBottom: '1px solid rgba(255, 0, 60, 0.2)',
            boxShadow: '0 0 15px rgba(255, 0, 60, 0.15)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#FF003C', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'pulse 1s infinite' }}>security</span>
              SHIELD_UPLINK: THREAT INTERCEPTED
            </div>
            <div style={{ fontSize: 10, color: '#ffb3b2', lineHeight: 1.5 }}>
              {m.text}
            </div>
            <div style={{ position: 'absolute', right: -10, bottom: -15, fontSize: 44, color: 'rgba(255, 0, 60, 0.04)', fontWeight: 900, pointerEvents: 'none', userSelect: 'none' }}>
              SAFE
            </div>
          </div>
        );
      }

      if (isOperatorAbort) {
        return (
          <div key={m.id} style={{
            fontFamily: 'JetBrains Mono',
            margin: '8px 0',
            padding: '12px 16px',
            background: 'rgba(217, 119, 6, 0.08)',
            borderLeft: '4px solid #D97706',
            borderRight: '1px solid rgba(217, 119, 6, 0.2)',
            borderTop: '1px solid rgba(217, 119, 6, 0.2)',
            borderBottom: '1px solid rgba(217, 119, 6, 0.2)',
            boxShadow: '0 0 15px rgba(217, 119, 6, 0.1)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#D97706', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>cancel</span>
              OPERATOR OVERRIDE: ACTION ABORTED
            </div>
            <div style={{ fontSize: 10, color: '#fef3c7', lineHeight: 1.5 }}>
              {m.text}
            </div>
          </div>
        );
      }

      if (isEmergencyStop) {
        return (
          <div key={m.id} style={{
            fontFamily: 'JetBrains Mono',
            margin: '8px 0',
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid #ef4444',
            boxShadow: '0 0 20px rgba(239, 68, 68, 0.25)',
            position: 'relative',
            overflow: 'hidden',
            animation: 'pulse 2s infinite'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>emergency_home</span>
              🚨 EMERGENCY HARD STOP ACTIVE
            </div>
            <div style={{ fontSize: 10, color: '#fee2e2', lineHeight: 1.5, fontWeight: 700 }}>
              {m.text}
            </div>
          </div>
        );
      }

      return (
        <div key={m.id}>
          <div style={{ ...baseStyle, padding: '10px 14px', background: m.role === 'error' ? 'rgba(40,5,5,0.7)' : 'rgba(0,30,20,0.5)', border: m.role === 'error' ? '1px solid rgba(255,0,60,0.35)' : '1px solid rgba(0,255,156,0.15)', fontSize: 11, color: m.role === 'error' ? '#ff525c' : '#00dbe9', whiteSpace: 'pre-wrap' }}>
            {m.text}
          </div>
          {!isVoted && !busy && associatedAction && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 14px 8px' }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: '#5f3e3e', marginRight: 4 }}>FEEDBACK?</span>

              <button
                onClick={() => {
                  setFeedbackStates(prev => ({ ...prev, [m.id]: { correct: true, showInput: false, inputValue: fb?.inputValue || '' } }));
                  if (apiAvailable()) {
                    window.pywebview!.api.report_feedback(JSON.stringify({
                      command: associatedCommand,
                      action_taken: associatedAction,
                      correct: true,
                      correct_action: null,
                    }));
                  }
                }}
                style={{
                  background: 'rgba(0, 255, 156, 0.04)',
                  border: '1px solid rgba(0, 255, 156, 0.25)',
                  color: '#00FF9C',
                  cursor: 'pointer',
                  padding: '3px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease-in-out'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 255, 156, 0.15)';
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 156, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 255, 156, 0.04)';
                  e.currentTarget.style.borderColor = 'rgba(0, 255, 156, 0.25)';
                }}
                title="Correct action"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>check</span>
              </button>

              <button
                onClick={() => {
                  setFeedbackStates(prev => ({ ...prev, [m.id]: { correct: false, showInput: false, inputValue: fb?.inputValue || '' } }));
                }}
                style={{
                  background: 'rgba(255, 0, 60, 0.04)',
                  border: '1px solid rgba(255, 0, 60, 0.25)',
                  color: '#ff525c',
                  cursor: 'pointer',
                  padding: '3px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease-in-out'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 0, 60, 0.15)';
                  e.currentTarget.style.borderColor = 'rgba(255, 0, 60, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 0, 60, 0.04)';
                  e.currentTarget.style.borderColor = 'rgba(255, 0, 60, 0.25)';
                }}
                title="Incorrect action"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>close</span>
              </button>
            </div>
          )}
          {fb?.correct === false && !fb?.showInput && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 14px 8px' }}>
              <button
                onClick={() => {
                  setFeedbackStates(prev => ({ ...prev, [m.id]: { ...prev[m.id], showInput: true } }));
                }}
                style={{ background: 'rgba(255,0,60,0.1)', border: '1px solid rgba(255,0,60,0.3)', color: '#ffb3b2', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 9, padding: '4px 10px' }}
              >SPECIFY CORRECT ACTION</button>
              <button
                onClick={() => {
                  setFeedbackStates(prev => ({ ...prev, [m.id]: { ...prev[m.id], correct: null, showInput: false, inputValue: '' } }));
                }}
                style={{ background: 'none', border: '1px solid rgba(154,112,112,0.3)', color: '#9a7070', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 8, padding: '4px 8px' }}
              >SKIP</button>
            </div>
          )}
          {fb?.showInput && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 14px 8px' }}>
              <input
                placeholder='e.g. "open the calculator" or {"action": "..."}'
                value={fb.inputValue}
                onChange={e => {
                  const val = e.target.value;
                  setFeedbackStates(prev => ({ ...prev, [m.id]: { ...prev[m.id], inputValue: val } }));
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && fb.inputValue.trim()) {
                    let correctAction: any = null;
                    try { correctAction = JSON.parse(fb.inputValue.trim()); } catch { correctAction = fb.inputValue.trim(); }
                    if (apiAvailable()) {
                      window.pywebview!.api.report_feedback(JSON.stringify({
                        command: associatedCommand,
                        action_taken: associatedAction,
                        correct: false,
                        correct_action: correctAction,
                      }));
                    }
                    setFeedbackStates(prev => ({ ...prev, [m.id]: { ...prev[m.id], correct: false, showInput: false } }));
                  }
                }}
                style={{ flex: 1, padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
              />
              <button
                onClick={() => {
                  if (fb.inputValue.trim()) {
                    let correctAction: any = null;
                    try { correctAction = JSON.parse(fb.inputValue.trim()); } catch { correctAction = fb.inputValue.trim(); }
                    if (apiAvailable()) {
                      window.pywebview!.api.report_feedback(JSON.stringify({
                        command: associatedCommand,
                        action_taken: associatedAction,
                        correct: false,
                        correct_action: correctAction,
                      }));
                    }
                    setFeedbackStates(prev => ({ ...prev, [m.id]: { ...prev[m.id], correct: false, showInput: false } }));
                  }
                }}
                style={{ padding: '6px 12px', background: 'rgba(255,0,60,0.12)', border: '1px solid rgba(255,0,60,0.3)', color: '#ffb3b2', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 9 }}
              >SUBMIT</button>
            </div>
          )}
          {isVoted && (
            <div style={{ padding: '4px 14px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              {fb?.correct ? (
                <div style={{
                  background: 'rgba(0, 255, 156, 0.05)',
                  border: '1px solid rgba(0, 255, 156, 0.2)',
                  color: '#00FF9C',
                  fontSize: '8px',
                  fontFamily: 'JetBrains Mono',
                  letterSpacing: '0.08em',
                  padding: '2px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>verified</span>
                  ✓ ACTION SYNCED
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                  <div style={{
                    background: 'rgba(255, 0, 60, 0.05)',
                    border: '1px solid rgba(255, 0, 60, 0.2)',
                    color: '#ff525c',
                    fontSize: '8px',
                    fontFamily: 'JetBrains Mono',
                    letterSpacing: '0.08em',
                    padding: '2px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    alignSelf: 'flex-start'
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>report</span>
                    ✗ ANOMALY REPORTED
                  </div>
                  {fb?.inputValue && (
                    <div style={{ fontSize: '8px', fontFamily: 'JetBrains Mono', color: '#888', paddingLeft: '8px' }}>
                      CORRECTION: "{fb.inputValue}"
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

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
            { label: '📂 List Desktop', cmd: 'list files on desktop' },
            { label: '📖 Read File', cmd: () => filePath ? `read file ${filePath}` : 'list files on desktop' },
            { label: '🗑 Delete File', cmd: () => filePath ? `delete file ${filePath}` : null },
            { label: '📁 New Folder', cmd: () => filePath ? `create folder ${filePath}` : null },
            { label: '📄 Create File', cmd: () => filePath ? `create file ${filePath}` : null },
            { label: '📋 List Downloads', cmd: 'list files in downloads folder' },
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
            { label: '🔍 Google', cmd: 'open https://www.google.com' },
            { label: '▶ YouTube', cmd: 'open https://www.youtube.com' },
            { label: '💻 GitHub', cmd: 'open https://github.com' },
            { label: '📰 Reddit', cmd: 'open https://www.reddit.com' },
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
      case 'apps': return renderAppsPanel();
      case 'input': return renderHIDPanel();
      case 'file': return renderFilePanel();
      case 'system': return renderSystemPanel();
      case 'comm': return renderCommPanel();
      default: return null;
    }
  }

  /* ─── Main render ─────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: '#0d0505' }}>

      {/* ═══ SUGGESTION TOASTS ═══════════════════════════════════ */}
      {(toolSuggestions.length > 0 || sequenceSuggestions.length > 0) && (
        <div style={{ position: 'absolute', top: 40, right: 20, zIndex: 50, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {toolSuggestions.map(s => (
            <div key={s.action_requested} style={{ padding: 16, background: '#150808', border: '1px solid rgba(255,180,0,0.4)', fontFamily: 'JetBrains Mono', width: 320, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#ffb400', marginBottom: 6 }}>💡 SUGGESTED SKILL</div>
              <div style={{ fontSize: 10, color: '#d0ba90', marginBottom: 12 }}>You've requested '{s.action_requested}' {s.frequency} times. Want to add it as a custom action?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => {
                  if (apiAvailable()) window.pywebview!.api.mark_tool_suggested(s.action_requested);
                  setToolSuggestions(prev => prev.filter(p => p.action_requested !== s.action_requested));
                }} style={{ flex: 1, padding: '6px', background: 'rgba(255,180,0,0.15)', border: '1px solid rgba(255,180,0,0.4)', color: '#ffb400', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>ACKNOWLEDGE</button>
              </div>
            </div>
          ))}
          {sequenceSuggestions.map((s, idx) => (
            <div key={idx} style={{ padding: 16, background: '#150808', border: '1px solid rgba(0,219,233,0.4)', fontFamily: 'JetBrains Mono', width: 320, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#00dbe9', marginBottom: 6 }}>🧠 REPETITIVE TASK DETECTED</div>
              <div style={{ fontSize: 10, color: '#ffdad8', marginBottom: 6 }}>You've run this sequence {s.frequency} times:</div>
              <div style={{ fontSize: 9, color: '#af8786', background: 'rgba(0,0,0,0.3)', padding: 6, marginBottom: 12, borderLeft: '2px solid #00dbe9', whiteSpace: 'pre-wrap' }}>
                {s.steps.join('\n➔ ')}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={async () => {
                  const name = prompt("Enter a name for this custom macro/skill (e.g. 'morning routine'):");
                  if (name && name.trim()) {
                    if (apiAvailable()) {
                      const res = await window.pywebview!.api.save_macro(name.trim(), s.steps);
                      if (res === "Success") {
                        addMsg('sys', `Macro '${name.trim()}' saved successfully!`);
                        if (apiAvailable()) window.pywebview!.api.dismiss_sequence_suggestion(s.steps);
                        setSequenceSuggestions(prev => prev.filter(p => JSON.stringify(p.steps) !== JSON.stringify(s.steps)));
                      } else {
                        alert(res);
                      }
                    }
                  }
                }} style={{ flex: 1, padding: '6px', background: 'rgba(0,219,233,0.15)', border: '1px solid rgba(0,219,233,0.4)', color: '#00dbe9', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>SAVE AS MACRO</button>
                <button onClick={() => {
                  if (apiAvailable()) window.pywebview!.api.dismiss_sequence_suggestion(s.steps);
                  setSequenceSuggestions(prev => prev.filter(p => JSON.stringify(p.steps) !== JSON.stringify(s.steps)));
                }} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid rgba(154,112,112,0.4)', color: '#9a7070', cursor: 'pointer', fontSize: 10 }}>IGNORE</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ CLEAR CHAT MODAL ══════════════════════════════════════════ */}
      {showClearChatModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ padding: 32, background: '#150808', border: '1px solid rgba(255,0,60,0.35)', fontFamily: 'JetBrains Mono', maxWidth: 380, width: '90%' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#ffb3b2', marginBottom: 10 }}>CLEAR CHAT HISTORY?</div>
            <div style={{ fontSize: 11, color: '#9a7070', marginBottom: 24 }}>This will clear the visual chat history. Personalization memory will remain intact.</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={clearChatOnly} style={{ flex: 1, padding: '10px', background: 'rgba(255,0,60,0.15)', border: '1px solid rgba(255,0,60,0.4)', color: '#ff525c', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700 }}>CONFIRM</button>
              <button onClick={() => setShowClearChatModal(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(154,112,112,0.4)', color: '#9a7070', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 11 }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CLEAR MEMORY MODAL ════════════════════════════════════════ */}
      {showClearMemoryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ padding: 32, background: '#150808', border: '1px solid rgba(255,0,60,0.35)', fontFamily: 'JetBrains Mono', maxWidth: 380, width: '90%' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#ffb3b2', marginBottom: 10 }}>CLEAR CONVERSATION MEMORY?</div>
            <div style={{ fontSize: 11, color: '#9a7070', marginBottom: 24 }}>This will erase the active LLM conversation memory context. Personalization profile will be kept.</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={clearMemoryOnly} style={{ flex: 1, padding: '10px', background: 'rgba(255,0,60,0.15)', border: '1px solid rgba(255,0,60,0.4)', color: '#ff525c', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700 }}>CONFIRM</button>
              <button onClick={() => setShowClearMemoryModal(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(154,112,112,0.4)', color: '#9a7070', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 11 }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ REMINDER MODAL ═══════════════════════════════════════════ */}
      {showReminderModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ padding: 24, background: '#150808', border: '1px solid rgba(255,0,60,0.35)', fontFamily: 'JetBrains Mono', maxWidth: 400, width: '90%' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ffb3b2', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ff525c' }}>alarm</span>
              SCHEDULE REMINDER UPLINK
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 9, color: '#ffb3b2', letterSpacing: '0.1em', marginBottom: 6 }}>REMINDER MESSAGE</div>
              <input
                id="reminder-message-input"
                type="text"
                value={reminderMsg}
                onChange={e => setReminderMsg(e.target.value)}
                placeholder="What should I remind you about?"
                style={{
                  width: '100%', padding: '8px 10px', background: '#0d0505',
                  border: '1px solid rgba(255,0,60,0.25)', color: '#ffdad8',
                  fontFamily: 'JetBrains Mono', fontSize: 11, outline: 'none',
                  boxSizing: 'border-box',
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleSetReminderSubmit();
                  }
                }}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, color: '#ffb3b2', letterSpacing: '0.1em', marginBottom: 6 }}>DURATION</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {[
                  { label: '60s', value: 60 },
                  { label: '5m', value: 300 },
                  { label: '10m', value: 600 },
                  { label: '30m', value: 1800 },
                  { label: '1h', value: 3600 },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setReminderSeconds(opt.value)}
                    style={{
                      flex: 1,
                      padding: '4px 0',
                      background: reminderSeconds === opt.value ? 'rgba(255,0,60,0.15)' : 'transparent',
                      border: reminderSeconds === opt.value ? '1px solid #ff525c' : '1px solid rgba(255,0,60,0.15)',
                      color: reminderSeconds === opt.value ? '#ff525c' : '#8a6060',
                      cursor: 'pointer',
                      fontFamily: 'JetBrains Mono',
                      fontSize: 10,
                      fontWeight: reminderSeconds === opt.value ? 'bold' : 'normal'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 8, color: '#8a6060' }}>CUSTOM SECONDS:</span>
                <input
                  type="number"
                  value={reminderSeconds}
                  onChange={e => setReminderSeconds(parseInt(e.target.value) || 0)}
                  style={{
                    flex: 1, padding: '4px 8px', background: '#0d0505',
                    border: '1px solid rgba(255,0,60,0.25)', color: '#ffdad8',
                    fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleSetReminderSubmit}
                style={{ flex: 1, padding: '8px', background: 'rgba(255,0,60,0.15)', border: '1px solid #ff525c', color: '#ff525c', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700 }}
              >
                SET REMINDER
              </button>
              <button
                onClick={() => { setShowReminderModal(false); setReminderMsg(''); }}
                style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid rgba(154,112,112,0.4)', color: '#9a7070', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10 }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MIC PERMISSION MODAL ═════════════════════════════════════ */}
      {showMicModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ padding: 32, background: '#150808', border: '1px solid rgba(0,255,156,0.35)', fontFamily: 'JetBrains Mono', maxWidth: 380, width: '90%' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#00FF9C', marginBottom: 10 }}>MICROPHONE ACCESS UPLINK</div>
            <div style={{ fontSize: 11, color: '#9a7070', marginBottom: 24 }}>R.A.G.E. requires local microphone access for voice telemetry. Do you authorize this uplink?</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => { localStorage.setItem('rage_mic_perm', 'true'); setShowMicModal(false); toggleMic(true); }} style={{ flex: 1, padding: '10px', background: 'rgba(0,255,156,0.15)', border: '1px solid rgba(0,255,156,0.4)', color: '#00FF9C', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700 }}>AUTHORIZE</button>
              <button onClick={() => setShowMicModal(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(154,112,112,0.4)', color: '#9a7070', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 11 }}>DENY</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TITLE BAR (drag region for frameless window) ═══════════ */}
      {!isFullscreen && (
        <div
          className="flex-shrink-0 flex items-center justify-between px-4 pywebview-drag-region"
          style={{ height: 34, background: '#150808', borderBottom: '1px solid rgba(255,0,60,0.25)', WebkitAppRegion: 'drag' } as any}
        >
          {/* Title — drag area */}
          <div className="flex items-center gap-2" style={{ pointerEvents: 'none' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF003C', boxShadow: '0 0 6px #FF003C' }} />
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: '#ffb3b2', letterSpacing: '0.15em' }}>
              RAGE // COMMAND_OS
            </span>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#7a5555', letterSpacing: '0.05em', marginLeft: 8 }}>
              v2.0
            </span>
          </div>


          <div className="flex items-center gap-2 h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
            {/* download chat log */}
            <button
              title="Download chat log"
              onClick={downloadChatLog}
              className="material-symbols-outlined h-full flex items-center"
              style={{ fontSize: 15, color: '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#00dbe9'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
            >download</button>



            <div style={{ width: 1, height: 16, background: 'rgba(255,0,60,0.3)', margin: '0 8px' }} />

            {/* minimize window */}
            <button
              title="Minimize"
              onClick={minimizeWindow}
              className="material-symbols-outlined h-full flex items-center"
              style={{ fontSize: 16, color: '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ffb3b2'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
            >remove</button>

            {/* fullscreen toggle */}
            <button
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={toggleFullscreen}
              className="material-symbols-outlined h-full flex items-center ml-2"
              style={{ fontSize: 15, color: isFullscreen ? '#FF003C' : '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ffb3b2'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = isFullscreen ? '#FF003C' : '#8a6060'; }}
            >{isFullscreen ? 'fullscreen_exit' : 'fullscreen'}</button>

            {/* close window */}
            <button
              title="Close window"
              onClick={closeWindow}
              className="material-symbols-outlined h-full flex items-center ml-2"
              style={{ fontSize: 16, color: '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ff525c'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
            >close</button>
          </div>
        </div>
      )}

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
              {sandboxMode && (
                <div className="flex items-center gap-1 px-2 py-0.5" style={{ fontFamily: 'JetBrains Mono', fontSize: 9, background: 'rgba(255,0,60,0.15)', border: '1px solid #FF003C' }}>
                  <span style={{ color: '#FF003C', fontWeight: 700, letterSpacing: '0.05em' }}>SANDBOX_ACTIVE</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
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
                onClick={() => setShowReminderModal(true)}
                className="material-symbols-outlined"
                style={{ fontSize: 15, color: '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ffb3b2'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
              >alarm</button>
              {/* clear chat */}
              <button
                title="Clear chat history"
                onClick={() => setShowClearChatModal(true)}
                className="material-symbols-outlined"
                style={{ fontSize: 15, color: '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ff525c'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
              >playlist_remove</button>
              {/* settings */}
              <button
                title="System Settings"
                onClick={() => { fetchSettings(); setShowSettingsModal(true); }}
                className="material-symbols-outlined"
                style={{ fontSize: 15, color: '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ffdad8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
              >settings</button>
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
                    activeNav === 'apps' ? 'APP_CONTROL' :
                      activeNav === 'input' ? 'HID_SCREEN' :
                        activeNav === 'file' ? 'FILE_MATRIX' :
                          activeNav === 'system' ? 'SYSTEM_CLI' : 'COMMS_WEB'}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#7a5555' }}>0xRAGE_CORE</span>
              </div>

              {activeNav === 'uplink' ? (
                <div className="flex-1 relative overflow-hidden" style={{ background: '#0a0303' }}>
                  <GlobeCanvas onReady={onGlobeReady} />
                  <div className="absolute inset-0 scanline-overlay opacity-15 pointer-events-none" style={{ zIndex: 5 }} />
                </div>
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
                    onClick={copyChatLog}
                    className="material-symbols-outlined"
                    style={{ fontSize: 13, color: '#8a6060', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#00dbe9'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8a6060'; }}
                  >content_copy</button>
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
                  onClick={() => toggleMic()}
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

      {/* ═══ SETTINGS MODAL ══════════════════════════════════════════ */}
      {showSettingsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ padding: 24, background: '#150808', border: '1px solid rgba(255,0,60,0.35)', fontFamily: 'JetBrains Mono', maxWidth: 560, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#ffb3b2', marginBottom: 12, borderBottom: '1px solid rgba(255,0,60,0.2)', paddingBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>SYSTEM SETTINGS // CONTROL</span>
              <button onClick={() => setShowSettingsModal(false)} style={{ background: 'none', border: 'none', color: '#ff525c', cursor: 'pointer', fontSize: 14 }}>CLOSE</button>
            </div>

            {/* Tab Bar */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid rgba(255,0,60,0.15)' }}>
              <button
                onClick={() => setSettingsTab('profile' as any)}
                style={{
                  padding: '6px 16px',
                  background: settingsTab === ('profile' as any) ? 'rgba(0,219,233,0.12)' : 'transparent',
                  border: 'none',
                  borderBottom: settingsTab === ('profile' as any) ? '2px solid #00dbe9' : '2px solid transparent',
                  color: settingsTab === ('profile' as any) ? '#00dbe9' : '#6a4040',
                  fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer', fontWeight: 700
                }}
              >PROFILE</button>
              <button
                onClick={() => { setSettingsTab('memory'); fetchMemoryData(); }}
                style={{
                  padding: '6px 16px',
                  background: settingsTab === 'memory' ? 'rgba(0,219,233,0.12)' : 'transparent',
                  border: 'none',
                  borderBottom: settingsTab === 'memory' ? '2px solid #00dbe9' : '2px solid transparent',
                  color: settingsTab === 'memory' ? '#00dbe9' : '#6a4040',
                  fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer', fontWeight: 700
                }}
              >MEMORY DB</button>
              <button
                onClick={() => setSettingsTab('settings')}
                style={{
                  padding: '6px 16px',
                  background: settingsTab === 'settings' ? 'rgba(255,0,60,0.12)' : 'transparent',
                  border: 'none',
                  borderBottom: settingsTab === 'settings' ? '2px solid #ff525c' : '2px solid transparent',
                  color: settingsTab === 'settings' ? '#ffb3b2' : '#6a4040',
                  fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer', fontWeight: 700
                }}
              >SETTINGS</button>
            </div>

            {settingsTab === 'settings' && (
              <>
                {/* Sandbox Mode */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#ffb3b2' }}>SANDBOX MODE</div>
                    <div style={{ fontSize: 9, color: '#9a7070' }}>Bypass execution for dry-runs</div>
                  </div>
                  <button
                    onClick={() => {
                      if (apiAvailable()) window.pywebview!.api.set_sandbox_mode(!sandboxMode);
                    }}
                    style={{
                      padding: '6px 12px',
                      background: sandboxMode ? 'rgba(0,255,156,0.15)' : 'rgba(255,0,60,0.15)',
                      border: sandboxMode ? '1px solid #00FF9C' : '1px solid #FF003C',
                      color: sandboxMode ? '#00FF9C' : '#FF003C',
                      fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer', fontWeight: 700
                    }}
                  >
                    {sandboxMode ? 'ACTIVE (DRY-RUN)' : 'INACTIVE (LIVE)'}
                  </button>
                </div>

                {/* Run on Startup */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#ffb3b2' }}>STARTUP ON BOOT</div>
                    <div style={{ fontSize: 9, color: '#9a7070' }}>Launch agent automatically when Windows starts</div>
                  </div>
                  <button
                    onClick={() => {
                      if (apiAvailable()) window.pywebview!.api.set_startup_enabled(!startupEnabled);
                    }}
                    style={{
                      padding: '6px 12px',
                      background: startupEnabled ? 'rgba(0,219,233,0.15)' : 'rgba(154,112,112,0.15)',
                      border: startupEnabled ? '1px solid #00dbe9' : '1px solid #8a6060',
                      color: startupEnabled ? '#00dbe9' : '#8a6060',
                      fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer', fontWeight: 700
                    }}
                  >
                    {startupEnabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                {/* Macros List */}
                <div style={{ borderTop: '1px solid rgba(255,0,60,0.15)', paddingTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#ffb3b2', marginBottom: 8 }}>SAVED MACROS / SKILLS</div>
                  {Object.keys(macros).length === 0 ? (
                    <div style={{ fontSize: 9, color: '#5f3e3e', fontStyle: 'italic' }}>No macros saved yet. Try saying "save this as morning routine" after running tasks.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {Object.entries(macros).map(([name, steps]) => (
                        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '6px 10px', border: '1px solid rgba(255,0,60,0.1)' }}>
                          <div style={{ flex: 1, paddingRight: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#ffdad8' }}>{name}</div>
                            <div style={{ fontSize: 8, color: '#8a6060', wordBreak: 'break-all' }}>Steps: {steps.join(' ➔ ')}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <button
                              onClick={() => {
                                setEditMacroName(name);
                                setEditMacroInstruction('');
                                setEditMacroError('');
                                setShowEditMacroModal(true);
                              }}
                              style={{ background: 'none', border: 'none', color: '#00dbe9', cursor: 'pointer', fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 'bold' }}
                            >EDIT</button>
                            <button
                              onClick={() => {
                                if (apiAvailable()) window.pywebview!.api.delete_macro(name);
                              }}
                              style={{ background: 'none', border: 'none', color: '#ff525c', cursor: 'pointer', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                            >DELETE</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── PROFILE TAB ─────────────────────────────────────────── */}
            {settingsTab === ('profile' as any) && (() => {

              const toneOptions: { id: ToneId; label: string; icon: string; desc: string; color: string }[] = [

                {
                  id: 'professional',
                  label: 'PROFESSIONAL',
                  icon: 'work',
                  desc: 'Crisp, accountable answers—no fluff, just results.',
                  color: '#00dbe9',
                },
                {
                  id: 'sarcastic',
                  label: 'SARCASTIC AI',
                  icon: 'mood_bad',
                  desc: 'Dry wit with sharp edges—helpful, but never boring.',
                  color: '#ff9933',
                },
                {
                  id: 'nerd',
                  label: 'NERD',
                  icon: 'psychology',
                  desc: 'Technical depth, clever analogies, and zero intimidation.',
                  color: '#00f0ff',
                },
                {
                  id: 'simple',
                  label: 'SIMPLE',
                  icon: 'chat_bubble',
                  desc: 'Short, friendly steps. If it’s complicated, it gets simplified.',
                  color: '#00ff9c',
                },
                {
                  id: 'corny',
                  label: 'CORNY',
                  icon: 'emoji_emotions',
                  desc: 'Lighthearted puns and energetic vibes. Warning: groans ahead.',
                  color: '#ffee55',
                },
                {
                  id: 'deadpan',
                  label: 'DEADPAN',
                  icon: 'sentiment_dissatisfied',
                  desc: 'Flat delivery, surprisingly effective guidance.',
                  color: '#9aa7b2',
                },
                {
                  id: 'military',
                  label: 'MISSION CONTROL',
                  icon: 'airplanemode_active',
                  desc: 'Structured, command-ready updates. Priorities first, always.',
                  color: '#00dbe9',
                },
                {
                  id: 'poetic',
                  label: 'POETIC',
                  icon: 'auto_stories',
                  desc: 'Beautiful phrasing with practical intent underneath.',
                  color: '#ffb3b2',
                },
                {
                  id: 'hype_man',
                  label: 'HYPE MAN',
                  icon: 'campaign',
                  desc: 'Motivation on demand—confident, fast, and contagious.',
                  color: '#ff525c',
                },
                {
                  id: 'villain',
                  label: 'VILLAIN MODE',
                  icon: 'whatshot',
                  desc: 'Chaotic confidence. Dramatic plans, surprisingly careful execution.',
                  color: '#ff003c',
                },
                {
                  id: 'storyteller',
                  label: 'STORYTELLER',
                  icon: 'menu_book',
                  desc: 'Explains through narrative—context you can actually remember.',
                  color: '#9966ff',
                },
                {
                  id: 'zen_coach',
                  label: 'ZEN COACH',
                  icon: 'self_improvement',
                  desc: 'Calm focus. Clear boundaries and steady next steps.',
                  color: '#8be9ff',
                },
                {
                  id: 'mission_control',
                  label: 'SITUATIONAL OPERATOR',
                  icon: 'navigation',
                  desc: 'Real-time triage, smart questions, and crisp outcomes.',
                  color: '#00dbe9',
                },
                {
                  id: 'custom',
                  label: 'CUSTOM',
                  icon: 'tune',
                  desc: 'Your own tone—paste your prompt and steer the vibe.',
                  color: '#c4a0ff',
                },
              ];


              const fieldStyle: React.CSSProperties = {
                width: '100%', padding: '8px 10px', background: '#0d0505',
                border: '1px solid rgba(0,219,233,0.25)', color: '#ffdad8',
                fontFamily: 'JetBrains Mono', fontSize: 11, outline: 'none',
                boxSizing: 'border-box',
              };

              async function saveProfile() {
                setProfileSaving(true);
                setProfileSaved(false);
                try {
                  if (apiAvailable() && window.pywebview?.api?.set_profile_batch) {
                    await window.pywebview.api.set_profile_batch(JSON.stringify(profileDraft));
                  }
                  setProfile(profileDraft);
                  setProfileSaved(true);
                  setTimeout(() => setProfileSaved(false), 2500);
                } catch (e) {
                  console.error('Profile save failed:', e);
                } finally {
                  setProfileSaving(false);
                }
              }

              return (
                <div style={{ color: '#ffdad8' }}>
                  {/* Header strip */}
                  <div style={{ marginBottom: 20, padding: '10px 14px', background: 'rgba(0,219,233,0.06)', border: '1px solid rgba(0,219,233,0.18)', borderLeft: '3px solid #00dbe9' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#00dbe9', letterSpacing: '0.1em' }}>IDENTITY MATRIX // PERSONALIZATION</div>
                    <div style={{ fontSize: 9, color: '#9a7070', marginTop: 3 }}>Teach the agent who you are. It will remember your identity across sessions.</div>
                  </div>

                  {/* Identity Fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#00dbe9', letterSpacing: '0.1em', marginBottom: 4 }}>YOUR NAME</div>
                      <input
                        id="profile-name"
                        value={profileDraft.name}
                        onChange={e => setProfileDraft(d => ({ ...d, name: e.target.value }))}
                        placeholder="e.g. Aditya"
                        style={fieldStyle}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#00dbe9', letterSpacing: '0.1em', marginBottom: 4 }}>AGENT NAME</div>
                      <input
                        id="profile-agent-name"
                        value={profileDraft.agent_name}
                        onChange={e => setProfileDraft(d => ({ ...d, agent_name: e.target.value }))}
                        placeholder="e.g. JARVIS, FRIDAY, MAX"
                        style={fieldStyle}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#00dbe9', letterSpacing: '0.1em', marginBottom: 4 }}>YOUR ROLE</div>
                      <input
                        id="profile-role"
                        value={profileDraft.role}
                        onChange={e => setProfileDraft(d => ({ ...d, role: e.target.value }))}
                        placeholder="e.g. developer, student, gamer"
                        style={fieldStyle}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#00dbe9', letterSpacing: '0.1em', marginBottom: 4 }}>INTERESTS / CONTEXT</div>
                      <input
                        id="profile-interests"
                        value={profileDraft.interests}
                        onChange={e => setProfileDraft(d => ({ ...d, interests: e.target.value }))}
                        placeholder="e.g. coding, gaming, music"
                        style={fieldStyle}
                      />
                    </div>
                  </div>

                  {/* Tone Selector */}
                  <div style={{ borderTop: '1px solid rgba(0,219,233,0.15)', paddingTop: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 9, color: '#00dbe9', letterSpacing: '0.1em', marginBottom: 10 }}>RESPONSE TONE // AI PERSONALITY</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#8a6060' }}>face</span>
                        <select
                          id="profile-tone-select"
                          value={profileDraft.tone}
                          onChange={e => setProfileDraft(d => ({ ...d, tone: e.target.value as ToneId }))}
                          style={{
                            flex: 1,
                            padding: '10px 12px',
                            background: '#0d0505',
                            border: '1px solid rgba(0,219,233,0.22)',
                            color: '#ffdad8',
                            fontFamily: 'JetBrains Mono',
                            fontSize: 11,
                            outline: 'none',
                            borderRadius: 4,
                          }}
                        >
                          {toneOptions.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,219,233,0.12)', borderRadius: 4 }}>
                        {(() => {
                          const t = toneOptions.find(x => x.id === profileDraft.tone);
                          if (!t) return null;
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 18, color: t.color }}>{t.icon}</span>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: t.color }}>{t.label}</div>
                                <div style={{ fontSize: 9, color: '#9a7070', lineHeight: 1.4 }}>{t.desc}</div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Custom tone textarea */}
                    {profileDraft.tone === 'custom' && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 9, color: '#00dbe9', letterSpacing: '0.1em', marginBottom: 6 }}>CUSTOM TONE PROMPT</div>
                        <textarea
                          id="profile-custom-tone"
                          value={profileDraft.custom_tone_prompt}
                          onChange={e => setProfileDraft(d => ({ ...d, custom_tone_prompt: e.target.value }))}
                          placeholder="Describe how the agent should talk to you... e.g. 'Respond like a hacker from a 90s movie. Use l33tspeak occasionally.'"
                          rows={3}
                          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Tone Preview Badge */}
                  <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 9, color: '#6a4040' }}>ACTIVE TONE PREVIEW:</div>
                    {(() => {
                      const t = toneOptions.find(x => x.id === profileDraft.tone);
                      if (!t) return null;
                      return <div style={{ padding: '3px 10px', border: `1px solid ${t.color}`, color: t.color, fontSize: 9, fontFamily: 'JetBrains Mono', letterSpacing: '0.08em' }}>{t.label}</div>;
                    })()}
                  </div>

                  {/* Save Button */}
                  <button
                    id="profile-save-btn"
                    onClick={saveProfile}
                    disabled={profileSaving}
                    style={{
                      width: '100%', padding: '10px', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700,
                      letterSpacing: '0.1em', cursor: profileSaving ? 'not-allowed' : 'pointer',
                      background: profileSaved ? 'rgba(0,255,156,0.15)' : 'rgba(0,219,233,0.15)',
                      border: profileSaved ? '1px solid #00ff9c' : '1px solid rgba(0,219,233,0.5)',
                      color: profileSaved ? '#00ff9c' : '#00dbe9',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    {profileSaving ? 'SAVING...' : profileSaved ? '✓ PROFILE SAVED' : 'SAVE PROFILE'}
                  </button>
                </div>
              );
            })()}

            {settingsTab === 'memory' && (
              <div style={{ fontSize: 10, color: '#9a7070' }}>
                {/* Stats Cards */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'INTERACTION HISTORY', key: 'interaction_history', color: '#00FF9C' },
                    { label: 'MACROS', key: 'macros', color: '#00dbe9' },
                    { label: 'INTERACTION LOG', key: 'interaction_log', color: '#ffb3b2' },
                  ].map(stat => (
                    <div key={stat.key} style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,0,60,0.15)`, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: stat.color, marginBottom: 4 }}>{memoryStats[stat.key] ?? '--'}</div>
                      <div style={{ fontSize: 8, color: '#8a6060', letterSpacing: '0.5px' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Interaction History */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#00FF9C', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                    <span>INTERACTION HISTORY (command ➔ action mapping)</span>
                    <span style={{ color: '#5f3e3e' }}>{memoryHistory.length} entries</span>
                  </div>
                  {memoryHistory.length === 0 ? (
                    <div style={{ fontSize: 9, color: '#5f3e3e', fontStyle: 'italic', padding: '8px 0' }}>No interaction history recorded yet.</div>
                  ) : (
                    <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {memoryHistory.map((row: any) => (
                        <div key={row.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,0,60,0.08)', padding: '6px 8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ color: '#ffdad8', fontSize: 9, fontWeight: 600 }}>{row.command}</span>
                            <span style={{ color: '#00FF9C', fontSize: 8 }}>x{row.frequency}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#6a4040', fontSize: 8 }}>Action: {row.action_taken}</span>
                            <span style={{ color: '#5f3e3e', fontSize: 7 }}>{row.learned_at}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Macros */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#00dbe9', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                    <span>MACROS</span>
                    <span style={{ color: '#5f3e3e' }}>{Object.keys(macros).length} saved</span>
                  </div>
                  {Object.keys(macros).length === 0 ? (
                    <div style={{ fontSize: 9, color: '#5f3e3e', fontStyle: 'italic', padding: '8px 0' }}>No macros saved.</div>
                  ) : (
                    <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {Object.entries(macros).map(([name, steps]) => (
                        <div key={name} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,219,233,0.1)', padding: '6px 8px' }}>
                          <div style={{ color: '#00dbe9', fontSize: 9, fontWeight: 600, marginBottom: 2 }}>{name}</div>
                          <div style={{ color: '#6a4040', fontSize: 8 }}>{steps.join(' ➔ ')}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Interaction Log */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#ffb3b2', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                    <span>INTERACTION LOG (raw execution trace)</span>
                    <span style={{ color: '#5f3e3e' }}>Latest {Math.min(memoryLog.length, 500)} entries</span>
                  </div>
                  {memoryLog.length === 0 ? (
                    <div style={{ fontSize: 9, color: '#5f3e3e', fontStyle: 'italic', padding: '8px 0' }}>No interaction log entries yet.</div>
                  ) : (
                    <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {memoryLog.map((row: any) => (
                        <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px', background: 'rgba(255,255,255,0.01)' }}>
                          <span style={{ color: '#8a6060', fontSize: 8 }}>{row.command}</span>
                          <span style={{ color: '#5f3e3e', fontSize: 7 }}>{row.timestamp}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Clear Memory Action */}
                <div style={{ borderTop: '1px solid rgba(255,0,60,0.2)', paddingTop: 16, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#ffb3b2' }}>CLEAR CONVERSATION MEMORY</div>
                    <div style={{ fontSize: 9, color: '#9a7070' }}>Reset the active LLM context memory. Personalization will be preserved.</div>
                  </div>
                  <button
                    onClick={() => setShowClearMemoryModal(true)}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(255,0,60,0.15)',
                      border: '1px solid #FF003C',
                      color: '#FF003C',
                      fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer', fontWeight: 700
                    }}
                  >
                    CLEAR MEMORY
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ DESTRUCTIVE CONFIRMATION MODAL ══════════════════════════════ */}
      {showConfirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ padding: 24, background: '#150808', border: '1px solid rgba(255,0,60,0.5)', fontFamily: 'JetBrains Mono', maxWidth: 400, width: '90%' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ff525c', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>warning</span>
              DESTRUCTIVE ACTION CONFIRMATION
            </div>
            <div style={{ fontSize: 10, color: '#ffb3b2', whiteSpace: 'pre-wrap', marginBottom: 20, lineHeight: 1.5 }}>
              {confirmMsg}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleConfirmDestructive}
                style={{ flex: 1, padding: '8px', background: 'rgba(255,0,60,0.2)', border: '1px solid #ff525c', color: '#ff525c', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700 }}
              >
                PROCEED DELETE
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setPendingAction(null);
                  addMsg('error', '❌ Action Aborted: Deletion request cancelled by user.');
                }}
                style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid rgba(154,112,112,0.4)', color: '#9a7070', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 10 }}
              >
                ABORT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PROMPT-BASED MACRO EDITING MODAL ══════════════════════════ */}
      {showEditMacroModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ padding: 24, background: '#150808', border: '1px solid rgba(0,219,233,0.35)', fontFamily: 'JetBrains Mono', maxWidth: 440, width: '90%' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#00dbe9', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit_note</span>
              EDIT MACRO VIA NATURAL LANGUAGE
            </div>

            <div style={{ fontSize: 10, color: '#9a7070', marginBottom: 8 }}>MACRO_NAME: <span style={{ color: '#ffb3b2', fontWeight: 'bold' }}>{editMacroName}</span></div>

            {/* Display current steps */}
            {macros[editMacroName] && (
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(154,112,112,0.2)', padding: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 8, color: '#8a6060', textTransform: 'uppercase', marginBottom: 4 }}>Current Steps:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {macros[editMacroName].map((step, idx) => (
                    <div key={idx} style={{ fontSize: 9, color: '#ffdad8' }}>{idx + 1}. {step}</div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: 10, color: '#9a7070', marginBottom: 6 }}>DESCRIBE MODIFICATIONS:</div>
            <textarea
              rows={3}
              placeholder="e.g. 'add open notepad to the end', 'remove the last step', 'insert open vscode before open whatsapp'"
              value={editMacroInstruction}
              onChange={e => setEditMacroInstruction(e.target.value)}
              disabled={editMacroBusy}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#150808',
                border: '1px solid rgba(0,219,233,0.25)',
                color: '#ffb3b2',
                fontFamily: 'JetBrains Mono',
                fontSize: 10,
                outline: 'none',
                resize: 'none',
                marginBottom: 12
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleEditMacro();
                }
              }}
            />

            {editMacroError && (
              <div style={{ fontSize: 9, color: '#ff525c', marginBottom: 12, whiteSpace: 'pre-wrap' }}>
                {editMacroError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleEditMacro}
                disabled={editMacroBusy || !editMacroInstruction.trim()}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: editMacroBusy ? 'rgba(0,219,233,0.05)' : 'rgba(0,219,233,0.15)',
                  border: '1px solid rgba(0,219,233,0.4)',
                  color: editMacroBusy ? '#4f7b80' : '#00dbe9',
                  cursor: editMacroBusy ? 'not-allowed' : 'pointer',
                  fontFamily: 'JetBrains Mono',
                  fontSize: 10,
                  fontWeight: 700
                }}
              >
                {editMacroBusy ? 'PROCESSING...' : 'APPLY MODIFICATIONS'}
              </button>
              <button
                onClick={() => { setShowEditMacroModal(false); setEditMacroInstruction(''); setEditMacroError(''); }}
                disabled={editMacroBusy}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: 'transparent',
                  border: '1px solid rgba(154,112,112,0.4)',
                  color: '#9a7070',
                  cursor: 'pointer',
                  fontFamily: 'JetBrains Mono',
                  fontSize: 10
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ FLOATING TOAST NOTIFICATIONS ══════════════════════════════ */}
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 90, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              padding: 12,
              background: 'rgba(21, 8, 8, 0.95)',
              border: t.type === 'clipboard' ? '1px solid rgba(0,219,233,0.5)' : t.type === 'file' ? '1px solid rgba(0,255,156,0.5)' : '1px solid rgba(255,0,60,0.5)',
              fontFamily: 'JetBrains Mono',
              width: 320,
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: t.type === 'clipboard' ? '#00dbe9' : t.type === 'file' ? '#00FF9C' : '#FF003C', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                {t.type === 'clipboard' ? 'content_paste' : t.type === 'file' ? 'folder' : 'notifications'}
              </span>
              {t.title}
            </div>
            <div style={{ fontSize: 9, color: '#ffb3b2', whiteSpace: 'pre-wrap' }}>{t.body}</div>
            {t.actionCmd && (
              <button
                onClick={() => {
                  submitCommand(t.actionCmd!);
                  setToasts(prev => prev.filter(toast => toast.id !== t.id));
                }}
                style={{
                  alignSelf: 'flex-start',
                  padding: '4px 8px',
                  background: 'rgba(0,219,233,0.1)',
                  border: '1px solid rgba(0,219,233,0.3)',
                  color: '#00dbe9',
                  cursor: 'pointer',
                  fontSize: 9,
                  fontFamily: 'JetBrains Mono',
                  marginTop: 4
                }}
              >
                EXECUTE ACTION
              </button>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}
