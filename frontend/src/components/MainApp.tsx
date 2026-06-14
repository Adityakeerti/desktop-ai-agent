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
        react_loop: (goal?: string, steps_hint_json?: string) => Promise<string>;
        get_todos: () => Promise<string>;
        add_todo: (task: string) => Promise<string>;
        mark_todo_complete: (task_id_or_name: string) => Promise<string>;
        delete_todo: (task_id_or_name: string) => Promise<string>;
        start_pomodoro: (duration: number, label: string) => Promise<string>;
        stop_pomodoro: () => Promise<string>;
        get_open_windows?: () => Promise<string>;
        get_monitor_layouts?: () => Promise<string>;
        tile_windows?: (layout: string, apps_json: string) => Promise<string>;
        manage_tabs?: (app_name: string, tab_action: string) => Promise<string>;
        get_execution_ledger?: (limit?: number) => Promise<string>;
        undo_last_action?: () => Promise<string>;
        replay_ledger_action?: (action_id: number) => Promise<string>;
        get_all_facts?: () => Promise<string>;
        save_fact?: (fact: string) => Promise<string>;
        delete_fact?: (fact: string) => Promise<string>;
        get_battery_status_data?: () => Promise<string>;
        get_resource_hogs_data?: () => Promise<string>;
        get_startup_apps?: () => Promise<string>;
        toggle_startup_app?: (name: string, enabled: boolean, path?: string) => Promise<string>;
        get_clipboard_history_data?: (limit?: number) => Promise<string>;
        delete_clipboard_item?: (text: string) => Promise<string>;
        get_recent_files_data?: (limit?: number) => Promise<string>;
        get_recycle_bin_data?: () => Promise<string>;
        restore_recycle_bin_item?: (path: string) => Promise<string>;
        search_files_data?: (start_dir: string, query?: string, ext?: string, days?: number, min_size?: string, max_size?: string) => Promise<string>;
        zip_files?: (files_json: string, output_path: string) => Promise<string>;
        unzip_files?: (archive_path: string, output_dir: string) => Promise<string>;
        read_notes_file?: () => Promise<string>;
        save_notes_file?: (content: string) => Promise<string>;
        get_apps?: () => Promise<string>;
        get_installed_apps?: () => Promise<string>;
        add_app?: (label: string, icon: string, path_or_command: string) => Promise<string>;
        delete_app?: (label: string) => Promise<string>;
        launch_app?: (label: string, path_or_command: string) => Promise<string>;
      };
    };
    onClipboardNotification?: (payload: { text: string; type: 'url' | 'path' }) => void;
    onFileOrganized?: (payload: { filename: string; category: string; destination: string }) => void;
    onWindowsNotification?: (payload: { app: string; title: string; body: string }) => void;
    onPomodoroUpdate?: (payload: { active: boolean; remaining: number; total: number; label: string; completed?: boolean; cancelled?: boolean }) => void;
    onSettingsChanged?: () => void;
    addMessageFromPython?: (role: any, text: string) => void;
  }
}

/* ─── Types ────────────────────────────────────────────────────────────────── */
type Role = 'rage' | 'user' | 'result' | 'error' | 'action' | 'sys' | 'react_start' | 'react_plan' | 'react_step' | 'react_result' | 'react_done' | 'clarify';
interface Msg { id: number; role: Role; text: string; ts: string; command?: string; action_taken?: any; options?: string[]; }
type PanelId = 'uplink' | 'apps' | 'input' | 'file' | 'system' | 'comm' | 'todo';
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
  macro_recommendations_enabled?: string;
  macro_min_freq?: string;
  macro_timeout_sec?: string;
}

/* ─── Constants ────────────────────────────────────────────────────────────── */
const NAV_ITEMS: { id: PanelId; icon: string; label: string }[] = [
  { id: 'uplink', icon: 'radar', label: 'Core Uplink' },
  { id: 'apps', icon: 'apps', label: 'App Control' },
  { id: 'input', icon: 'keyboard', label: 'HID & Screen' },
  { id: 'file', icon: 'folder_open', label: 'File Matrix' },
  { id: 'system', icon: 'terminal', label: 'System CLI' },
  { id: 'comm', icon: 'travel_explore', label: 'Comms & Web' },
  { id: 'todo', icon: 'playlist_add_check', label: 'Todo List' },
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
  const [todos, setTodos] = useState<any[]>([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [pomodoro, setPomodoro] = useState<{ active: boolean; remaining: number; total: number; label: string }>({
    active: false,
    remaining: 0,
    total: 0,
    label: ''
  });

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

  // Dynamic App Matrix states
  interface AppItem {
    id?: number;
    label: string;
    icon: string;
    path_or_command: string;
  }
  const [apps, setApps] = useState<AppItem[]>([
    { label: 'Notepad', icon: 'edit_note', path_or_command: 'notepad' },
    { label: 'Calculator', icon: 'calculate', path_or_command: 'calculator' },
    { label: 'Explorer', icon: 'folder_open', path_or_command: 'explorer' },
    { label: 'Chrome', icon: 'language', path_or_command: 'chrome' },
    { label: 'Task Manager', icon: 'monitor_heart', path_or_command: 'task manager' },
    { label: 'VS Code', icon: 'code', path_or_command: 'vs code' },
    { label: 'Spotify', icon: 'music_note', path_or_command: 'spotify' },
    { label: 'Discord', icon: 'forum', path_or_command: 'discord' },
    { label: 'Paint', icon: 'palette', path_or_command: 'paint' },
    { label: 'PowerShell', icon: 'terminal', path_or_command: 'powershell' },
    { label: 'Brave', icon: 'security', path_or_command: 'brave' },
    { label: 'Edge', icon: 'edge', path_or_command: 'edge' },
  ]);
  const [showAddAppModal, setShowAddAppModal] = useState(false);
  const [newAppLabel, setNewAppLabel] = useState('');
  const [newAppPath, setNewAppPath] = useState('');
  const [addAppError, setAddAppError] = useState('');
  const [installedApps, setInstalledApps] = useState<{ name: string; path: string }[]>([]);
  const [selectedInstalledApp, setSelectedInstalledApp] = useState('');
  const [showCustomAppFallback, setShowCustomAppFallback] = useState(false);

  // Clipboard/file/notification Toasts
  const [toasts, setToasts] = useState<{ id: number; type: 'clipboard' | 'file' | 'notification'; title: string; body: string; actionCmd?: string }[]>([]);

  // ── Phase 9: New State Variables ─────────────────────────────────────────
  const [openWindows, setOpenWindows] = useState<any[]>([]);
  const [monitorLayouts, setMonitorLayouts] = useState<any[]>([]);
  const [selectedWindows, setSelectedWindows] = useState<string[]>([]); // window process names
  const [tabAppName, setTabAppName] = useState('chrome');
  const [executionLedger, setExecutionLedger] = useState<any[]>([]);
  const [facts, setFacts] = useState<string[]>([]);
  const [newFactText, setNewFactText] = useState('');
  const [batteryStatus, setBatteryStatus] = useState<any>(null);
  const [resourceHogs, setResourceHogs] = useState<{ cpu: any[]; memory: any[] }>({ cpu: [], memory: [] });
  const [startupApps, setStartupApps] = useState<any[]>([]);
  const [newStartupName, setNewStartupName] = useState('');
  const [newStartupPath, setNewStartupPath] = useState('');
  const [clipboardHistory, setClipboardHistory] = useState<any[]>([]);
  const [clipSearchQuery, setClipSearchQuery] = useState('');
  const [recentFiles, setRecentFiles] = useState<any[]>([]);
  const [recycleBin, setRecycleBin] = useState<any[]>([]);
  
  // File search states
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [fileSearchExt, setFileSearchExt] = useState('');
  const [fileSearchDays, setFileSearchDays] = useState('');
  const [fileSearchMinSize, setFileSearchMinSize] = useState('');
  const [fileSearchMaxSize, setFileSearchMaxSize] = useState('');
  const [fileSearchStartDir, setFileSearchStartDir] = useState('E:/CODING');
  const [fileSearchResults, setFileSearchResults] = useState<any[]>([]);
  const [fileSearchBusy, setFileSearchBusy] = useState(false);

  // Compress/extract states
  const [compressFiles, setCompressFiles] = useState('');
  const [compressOutput, setCompressOutput] = useState('');
  const [decompressArchive, setDecompressArchive] = useState('');
  const [decompressOutput, setDecompressOutput] = useState('');
  const [notesText, setNotesText] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  // Panel tab selections (moved to top level to prevent hooks violation)
  const [todoTab, setTodoTab] = useState<'todo' | 'clipboard' | 'notes'>('todo');
  const [sysTab, setSysTab] = useState<'control' | 'ledger'>('control');
  const [fileTab, setFileTab] = useState<'actions' | 'search' | 'recent' | 'compress'>('actions');

  const fetchPhaseNineData = useCallback(async () => {
    if (!apiAvailable()) return;
    
    const safeFetch = async (apiFunc: any, setter: (val: any) => void, fallback: any) => {
      try {
        if (apiFunc) {
          const res = await apiFunc();
          setter(JSON.parse(res) || fallback);
        }
      } catch (e) {
        console.error(`Error in safeFetch:`, e);
        setter(fallback);
      }
    };

    await Promise.all([
      safeFetch(window.pywebview!.api.get_open_windows, setOpenWindows, []),
      safeFetch(window.pywebview!.api.get_monitor_layouts, setMonitorLayouts, []),
      safeFetch(window.pywebview!.api.get_execution_ledger, setExecutionLedger, []),
      safeFetch(window.pywebview!.api.get_all_facts, setFacts, []),
      safeFetch(window.pywebview!.api.get_battery_status_data, setBatteryStatus, null),
      safeFetch(window.pywebview!.api.get_resource_hogs_data, setResourceHogs, { cpu: [], memory: [] }),
      safeFetch(window.pywebview!.api.get_startup_apps, setStartupApps, []),
      safeFetch(window.pywebview!.api.get_clipboard_history_data, setClipboardHistory, []),
      safeFetch(window.pywebview!.api.get_recent_files_data, setRecentFiles, []),
      safeFetch(window.pywebview!.api.get_recycle_bin_data, setRecycleBin, []),
      safeFetch(window.pywebview!.api.get_apps, setApps, []),
      safeFetch(window.pywebview!.api.get_installed_apps, setInstalledApps, []),
      (async () => {
        try {
          if (window.pywebview!.api.read_notes_file) {
            const nStr = await window.pywebview!.api.read_notes_file();
            setNotesText(nStr || '');
          }
        } catch (e) {
          console.error(e);
        }
      })()
    ]);
  }, []);

  // ── Personalization Profile ─────────────────────────────────────────────
  const defaultProfile: UserProfile = {
    name: '', role: '', interests: '', tone: 'professional', custom_tone_prompt: '', agent_name: 'JARVIS',
    macro_recommendations_enabled: 'true',
    macro_min_freq: '3',
    macro_timeout_sec: '180',
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
  const addMsg = useCallback((role: Role, text: string, command?: string, action_taken?: any, options?: string[]) => {
    setMsgs(prev => [...prev, { id: ++msgCounter.current, role, text, ts: ts(), command, action_taken, options }]);
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

  const fetchTodos = useCallback(async () => {
    if (apiAvailable() && window.pywebview?.api?.get_todos) {
      try {
        const todosStr = await window.pywebview.api.get_todos();
        setTodos(JSON.parse(todosStr) || []);
      } catch (e) {
        console.error("Error fetching todos:", e);
        setTodos([]);
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
      fetchTodos();
      fetchPhaseNineData();
    }
  }, [fetchSettings, fetchProfile, fetchTodos, fetchPhaseNineData]);

  // Trigger Phase 9 fetch when navigating
  useEffect(() => {
    fetchPhaseNineData();
  }, [activeNav, fetchPhaseNineData]);

  // Polling for live system metrics (every 10s)
  useEffect(() => {
    if (!apiAvailable()) return;
    const interval = setInterval(async () => {
      try {
        if (window.pywebview!.api.get_resource_hogs_data) {
          const hogsStr = await window.pywebview!.api.get_resource_hogs_data();
          setResourceHogs(JSON.parse(hogsStr));
        }
        if (window.pywebview!.api.get_battery_status_data) {
          const battStr = await window.pywebview!.api.get_battery_status_data();
          setBatteryStatus(JSON.parse(battStr));
        }
      } catch (e) { }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to background hooks and event changes
  useEffect(() => {
    fetchSettings();
    fetchTodos();
    fetchPhaseNineData();
    window.onSettingsChanged = () => {
      fetchSettings();
      fetchTodos();
      fetchPhaseNineData();
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

    window.onPomodoroUpdate = (payload) => {
      setPomodoro({
        active: payload.active,
        remaining: payload.remaining,
        total: payload.total,
        label: payload.label
      });
      if (payload.completed) {
        addToast('notification', 'Pomodoro Session Done', `Congratulations! Session completed: ${payload.label}`);
      }
    };

    window.addMessageFromPython = (role: Role, text: string) => {
      addMsg(role, text);
    };

    return () => {
      window.onSettingsChanged = undefined;
      window.onClipboardNotification = undefined;
      window.onFileOrganized = undefined;
      window.onWindowsNotification = undefined;
      window.onPomodoroUpdate = undefined;
      window.addMessageFromPython = undefined;
    };
  }, [fetchSettings, addMsg, fetchTodos]);

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
        lastActionRef.current = res.full || { action: res.action };
        lastCommandRef.current = raw;

        if (res.action === 'multi_step') {
          addMsg('action', `🧠 AGENT WILL PLAN & EXECUTE RE-ACT LOOP`);
          const hintsJson = JSON.stringify((res as any).steps_hint || []);
          const startRes = await window.pywebview!.api.react_loop(raw, hintsJson);
          addMsg('sys', startRes);
          setBusy(false);
          isSubmittingRef.current = false;
          return;
        }

        if (res.action === 'clarify') {
          const reason = (res.full as any)?.reason || 'Clarification required:';
          const opts = (res.full as any)?.options || [];
          addMsg('clarify', reason, undefined, undefined, opts);
          setBusy(false);
          isSubmittingRef.current = false;
          return;
        }

        addMsg('action', `⚡ ACTION → ${res.action}`);

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

  const decideAppIcon = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.includes('code') || lower.includes('develop') || lower.includes('studio') || lower.includes('compiler') || lower.includes('sublime') || lower.includes('editor')) return 'code';
    if (lower.includes('spotify') || lower.includes('music') || lower.includes('audio') || lower.includes('sound') || lower.includes('volume') || lower.includes('itunes')) return 'music_note';
    if (lower.includes('discord') || lower.includes('chat') || lower.includes('slack') || lower.includes('teams') || lower.includes('messenger') || lower.includes('skype') || lower.includes('whatsapp') || lower.includes('telegram')) return 'forum';
    if (lower.includes('paint') || lower.includes('photoshop') || lower.includes('draw') || lower.includes('design') || lower.includes('illustrator') || lower.includes('gimp') || lower.includes('canvas')) return 'palette';
    if (lower.includes('chrome') || lower.includes('firefox') || lower.includes('opera') || lower.includes('safari') || lower.includes('brave') || lower.includes('internet') || lower.includes('web') || lower.includes('browser') || lower.includes('edge')) return 'language';
    if (lower.includes('calc')) return 'calculate';
    if (lower.includes('note') || lower.includes('text') || lower.includes('word') || lower.includes('office') || lower.includes('doc') || lower.includes('pdf') || lower.includes('excel') || lower.includes('powerpoint')) return 'edit_note';
    if (lower.includes('game') || lower.includes('steam') || lower.includes('epic') || lower.includes('play') || lower.includes('xbox') || lower.includes('nintendo') || lower.includes('retroarch')) return 'gamepad';
    if (lower.includes('terminal') || lower.includes('cmd') || lower.includes('powershell') || lower.includes('bash') || lower.includes('command') || lower.includes('console')) return 'terminal';
    if (lower.includes('security') || lower.includes('shield') || lower.includes('antivirus') || lower.includes('defender') || lower.includes('firewall') || lower.includes('vpn')) return 'security';
    if (lower.includes('mail') || lower.includes('outlook') || lower.includes('thunderbird') || lower.includes('postbox')) return 'mail';
    if (lower.includes('database') || lower.includes('sql') || lower.includes('mongo') || lower.includes('postgres') || lower.includes('redis')) return 'database';
    if (lower.includes('settings') || lower.includes('control') || lower.includes('options') || lower.includes('config')) return 'settings';
    if (lower.includes('explorer') || lower.includes('folder') || lower.includes('directory') || lower.includes('file')) return 'folder_open';
    if (lower.includes('task') || lower.includes('process') || lower.includes('monitor') || lower.includes('heart')) return 'monitor_heart';
    return 'smart_toy';
  };

  const handleAddAppSubmit = async () => {
    let label = '';
    let path = '';
    
    if (showCustomAppFallback) {
      if (!newAppLabel.trim()) {
        setAddAppError('Label is required for custom app');
        return;
      }
      if (!newAppPath.trim()) {
        setAddAppError('Path or command is required for custom app');
        return;
      }
      label = newAppLabel.trim();
      path = newAppPath.trim();
    } else {
      if (!selectedInstalledApp) {
        setAddAppError('Please select an installed app or choose the fallback option');
        return;
      }
      const selectedApp = installedApps.find(a => a.name === selectedInstalledApp);
      if (!selectedApp) {
        setAddAppError('Selected app not found');
        return;
      }
      label = selectedApp.name;
      path = selectedApp.path;
    }

    const icon = decideAppIcon(label);
    setAddAppError('');

    if (apiAvailable() && window.pywebview?.api?.add_app) {
      try {
        const res = await window.pywebview.api.add_app(label, icon, path);
        if (res === 'ok') {
          addMsg('sys', `Added app shortcut: ${label}`);
          setShowAddAppModal(false);
          setNewAppLabel('');
          setNewAppPath('');
          setSelectedInstalledApp('');
          setShowCustomAppFallback(false);
          fetchPhaseNineData();
        } else {
          setAddAppError(res);
        }
      } catch (e) {
        setAddAppError(String(e));
      }
    } else {
      // Fallback for demo mode
      const newApp = { label, icon, path_or_command: path };
      setApps(prev => [...prev, newApp]);
      addMsg('sys', `[DEMO MODE] Added app shortcut: ${label}`);
      setShowAddAppModal(false);
      setNewAppLabel('');
      setNewAppPath('');
      setSelectedInstalledApp('');
      setShowCustomAppFallback(false);
    }
  };

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

    if (m.role === 'clarify') return (
      <div key={m.id} className="flex flex-col gap-3 my-2 p-4" style={{
        fontFamily: 'JetBrains Mono',
        background: 'rgba(234, 88, 12, 0.08)',
        borderLeft: '4px solid #ea580c',
        borderRight: '1px solid rgba(234, 88, 12, 0.2)',
        borderTop: '1px solid rgba(234, 88, 12, 0.2)',
        borderBottom: '1px solid rgba(234, 88, 12, 0.2)',
        boxShadow: '0 0 15px rgba(234, 88, 12, 0.1)',
        fontSize: 12,
        color: '#ffdad8'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f97316', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 2 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>help_outline</span>
          CLARIFICATION REQUESTED
        </div>
        <div style={{ fontSize: 11, color: '#ffedd5', lineHeight: 1.5, marginBottom: 8 }}>
          {m.text}
        </div>
        {m.options && m.options.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {m.options.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => submitCommand(opt)}
                disabled={busy}
                className="px-3 py-1.5 transition-all text-xs font-semibold"
                style={{
                  background: 'rgba(234, 88, 12, 0.1)',
                  border: '1px solid rgba(234, 88, 12, 0.4)',
                  color: '#fdba74',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease-in-out',
                }}
                onMouseEnter={(e) => {
                  if (!busy) {
                    e.currentTarget.style.background = 'rgba(234, 88, 12, 0.25)';
                    e.currentTarget.style.borderColor = 'rgba(234, 88, 12, 0.8)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(234, 88, 12, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(234, 88, 12, 0.4)';
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    );

    if (m.role === 'react_start') return (
      <div key={m.id} style={{
        fontFamily: 'JetBrains Mono',
        margin: '10px 0',
        padding: '12px 16px',
        background: 'rgba(88, 28, 135, 0.08)',
        borderLeft: '4px solid #a78bfa',
        borderRight: '1px solid rgba(139, 92, 246, 0.2)',
        borderTop: '1px solid rgba(139, 92, 246, 0.2)',
        borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
        boxShadow: '0 0 15px rgba(139, 92, 246, 0.1)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c084fc', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>psychology</span>
          THINKING LAYER: ReAct LOOP RUNNING
        </div>
        <div style={{ fontSize: 11, color: '#e9d5ff', lineHeight: 1.5 }}>
          {m.text}
        </div>
      </div>
    );

    if (m.role === 'react_plan') return (
      <div key={m.id} style={{
        fontFamily: 'JetBrains Mono',
        margin: '6px 0',
        padding: '10px 14px',
        background: 'rgba(30, 41, 59, 0.25)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        fontSize: 11,
        color: '#cbd5e1',
        whiteSpace: 'pre-wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>assignment</span>
          Task Decomposition Plan
        </div>
        {m.text}
      </div>
    );

    if (m.role === 'react_step') return (
      <div key={m.id} style={{
        fontFamily: 'JetBrains Mono',
        margin: '8px 0 4px',
        padding: '8px 12px',
        background: 'rgba(251, 191, 36, 0.05)',
        borderLeft: '3px solid #fbbf24',
        borderRight: '1px solid rgba(251, 191, 36, 0.15)',
        borderTop: '1px solid rgba(251, 191, 36, 0.15)',
        borderBottom: '1px solid rgba(251, 191, 36, 0.15)',
        fontSize: 11,
        color: '#fbbf24',
        fontWeight: 600
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>pending</span>
          {m.text}
        </div>
      </div>
    );

    if (m.role === 'react_result') return (
      <div key={m.id} style={{
        fontFamily: 'JetBrains Mono',
        margin: '0 0 8px 12px',
        padding: '6px 12px',
        background: 'rgba(13, 148, 136, 0.04)',
        borderLeft: '2px dashed rgba(13, 148, 136, 0.3)',
        fontSize: 10,
        color: '#2dd4bf',
        whiteSpace: 'pre-wrap'
      }}>
        {m.text}
      </div>
    );

    if (m.role === 'react_done') return (
      <div key={m.id} style={{
        fontFamily: 'JetBrains Mono',
        margin: '10px 0',
        padding: '12px 16px',
        background: 'rgba(16, 185, 129, 0.08)',
        borderLeft: '4px solid #10b981',
        borderRight: '1px solid rgba(16, 185, 129, 0.2)',
        borderTop: '1px solid rgba(16, 185, 129, 0.2)',
        borderBottom: '1px solid rgba(16, 185, 129, 0.2)',
        boxShadow: '0 0 15px rgba(16, 185, 129, 0.1)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#34d399', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>task_alt</span>
          SEQUENCE COMPLETE
        </div>
        <div style={{ fontSize: 11, color: '#a7f3d0', lineHeight: 1.5 }}>
          {m.text}
        </div>
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
  function PanelButton({ label, icon, cmd, onClick }: { label: string; icon: string; cmd?: string; onClick?: () => void }) {
    return (
      <button
        onClick={onClick || (() => { if (cmd) { setActiveNav('uplink'); submitCommand(cmd); } })}
        disabled={busy}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 6, padding: '14px 8px',
          background: 'rgba(255,0,60,0.06)', border: '1px solid rgba(255,0,60,0.2)',
          color: busy ? '#3a1818' : '#af8786', cursor: busy ? 'not-allowed' : 'pointer',
          fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.06em',
          transition: 'all 0.15s ease',
          width: '100%', height: '100%',
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
    const handleTile = async (layout: string) => {
      if (!selectedWindows.length) {
        alert("Please select at least one window process to tile.");
        return;
      }
      if (apiAvailable() && window.pywebview?.api?.tile_windows) {
        try {
          const res = await window.pywebview.api.tile_windows(layout, JSON.stringify(selectedWindows));
          addMsg('sys', `Window tiling command executed: ${res}`);
        } catch (e) {
          console.error(e);
        }
      }
    };

    const handleTabAction = async (action: string) => {
      if (apiAvailable() && window.pywebview?.api?.manage_tabs) {
        try {
          const res = await window.pywebview.api.manage_tabs(tabAppName, action);
          addMsg('sys', `Tab action '${action}' sent to '${tabAppName}': ${res}`);
        } catch (e) {
          console.error(e);
        }
      }
    };

    return (
      <div style={{ padding: 16, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.12em', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>APP_CONTROL // LAUNCH_MATRIX</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {apps.map(a => (
              <div key={a.label} style={{ position: 'relative' }}>
                <PanelButton 
                  label={a.label} 
                  icon={a.icon} 
                  onClick={async () => {
                    if (apiAvailable() && window.pywebview?.api?.launch_app) {
                      try {
                        addMsg('sys', `Direct launching ${a.label}...`);
                        const res = await window.pywebview.api.launch_app(a.label, a.path_or_command);
                        addMsg('sys', `Launch result: ${res}`);
                      } catch (err) {
                        addMsg('sys', `Error launching ${a.label}: ${err}`);
                      }
                    } else {
                      addMsg('sys', `[DEMO MODE] Launching ${a.label} via command: open ${a.path_or_command}`);
                    }
                  }}
                />
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm(`Remove ${a.label} from App Matrix?`)) {
                      if (apiAvailable() && window.pywebview?.api?.delete_app) {
                        try {
                          await window.pywebview.api.delete_app(a.label);
                          addMsg('sys', `Removed ${a.label} from App Matrix.`);
                          fetchPhaseNineData();
                        } catch (err) {
                          console.error(err);
                        }
                      } else {
                        setApps(prev => prev.filter(x => x.label !== a.label));
                        addMsg('sys', `[DEMO MODE] Removed ${a.label}.`);
                      }
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    background: 'rgba(255, 0, 60, 0.25)',
                    border: '1px solid rgba(255, 0, 60, 0.5)',
                    color: '#ffb3b2',
                    borderRadius: '50%',
                    width: 14,
                    height: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: 8,
                    padding: 0,
                    opacity: 0.6,
                    transition: 'opacity 0.15s ease',
                    zIndex: 10
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(255, 0, 60, 0.6)'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'rgba(255, 0, 60, 0.25)'; }}
                  title="Remove App"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 9 }}>close</span>
                </button>
              </div>
            ))}
            <button
              onClick={() => setShowAddAppModal(true)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '14px 8px',
                background: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,0,60,0.25)',
                color: '#ff5577', cursor: 'pointer',
                fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.06em',
                transition: 'all 0.15s ease',
                minHeight: '74px'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,0,60,0.08)'; e.currentTarget.style.color = '#ffb3b2'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.01)'; e.currentTarget.style.color = '#ff5577'; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
              ADD APP
            </button>
          </div>
        </div>

        {/* Live Window Enumeration & Tiling */}
        <div style={{ borderTop: '1px dashed rgba(255,0,60,0.15)', paddingTop: 16 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.12em', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>ACTIVE_WINDOWS // TILING_INTERFACE {(Array.isArray(monitorLayouts) && monitorLayouts.length > 0) ? `(${monitorLayouts.length} MONITORS)` : ''}</span>
            <button 
              onClick={() => fetchPhaseNineData()} 
              style={{ background: 'none', border: 'none', color: '#ff5577', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>refresh</span> REFRESH
            </button>
          </div>
          
          <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,0,60,0.1)', padding: 10, maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {(() => {
              const wins = Array.isArray(openWindows) ? openWindows : [];
              if (wins.length === 0) {
                return <div style={{ color: '#5f3e3e', fontSize: 10, fontFamily: 'JetBrains Mono', textAlign: 'center', padding: '10px 0' }}>NO_ACTIVE_WINDOWS_DETECTED</div>;
              }
              return wins.map(w => {
                const cleanName = w.process_name ? w.process_name.replace('.exe', '') : 'unknown';
                const isSelected = selectedWindows.includes(cleanName);
                return (
                  <div 
                    key={w.hwnd} 
                    style={{ 
                      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', 
                      background: isSelected ? 'rgba(255,0,60,0.08)' : 'rgba(255,255,255,0.02)',
                      border: isSelected ? '1px solid rgba(255,0,60,0.3)' : '1px solid transparent',
                      fontSize: 10, fontFamily: 'JetBrains Mono', transition: 'all 0.15s ease'
                    }}
                  >
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => {
                        if (isSelected) {
                          setSelectedWindows(prev => prev.filter(x => x !== cleanName));
                        } else {
                          setSelectedWindows(prev => [...prev, cleanName]);
                        }
                      }}
                      style={{ cursor: 'pointer', accentColor: '#ff003c' }}
                    />
                    <span style={{ color: '#ff8899', width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cleanName}>
                      {cleanName}
                    </span>
                    <span style={{ color: '#8f7b7b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={w.title}>
                      {w.title}
                    </span>
                    <span style={{ color: '#5f3e3e', fontSize: 8 }}>
                      hWnd: {w.hwnd}
                    </span>
                  </div>
                );
              });
            })()}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b' }}>TILE_LAYOUT:</span>
            <button 
              onClick={() => handleTile('left_right')}
              disabled={selectedWindows.length === 0}
              style={{ flex: 1, padding: '6px', background: 'rgba(255,0,60,0.08)', border: '1px solid rgba(255,0,60,0.25)', color: selectedWindows.length ? '#ffb3b2' : '#5f3e3e', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: selectedWindows.length ? 'pointer' : 'not-allowed' }}
            >
              SIDE-BY-SIDE
            </button>
            <button 
              onClick={() => handleTile('grid')}
              disabled={selectedWindows.length === 0}
              style={{ flex: 1, padding: '6px', background: 'rgba(255,0,60,0.08)', border: '1px solid rgba(255,0,60,0.25)', color: selectedWindows.length ? '#ffb3b2' : '#5f3e3e', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: selectedWindows.length ? 'pointer' : 'not-allowed' }}
            >
              GRID_TILE
            </button>
            <button 
              onClick={() => setSelectedWindows([])}
              disabled={selectedWindows.length === 0}
              style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: selectedWindows.length ? '#af8786' : '#5f3e3e', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: selectedWindows.length ? 'pointer' : 'not-allowed' }}
            >
              CLEAR
            </button>
          </div>
        </div>

        {/* Tab Manager HUD */}
        <div style={{ borderTop: '1px dashed rgba(255,0,60,0.15)', paddingTop: 16 }}>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.12em', marginBottom: 10 }}>
            TAB_MANAGER_HUD // PROGRAMMATIC_TABS
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b' }}>TARGET_APP:</span>
            <input 
              value={tabAppName}
              onChange={e => setTabAppName(e.target.value)}
              placeholder="e.g. chrome, msedge, notepad"
              style={{ flex: 1, padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {[
              { label: '➕ NEW TAB', action: 'new_tab' },
              { label: '❌ CLOSE TAB', action: 'close_tab' },
              { label: '▶ NEXT TAB', action: 'next_tab' },
              { label: '◀ PREV TAB', action: 'prev_tab' },
            ].map(item => (
              <button 
                key={item.label}
                onClick={() => handleTabAction(item.action)}
                style={{ padding: '8px 4px', background: 'rgba(255,0,60,0.06)', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 8, cursor: 'pointer', textAlign: 'center' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,0,60,0.15)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,0,60,0.06)'; }}
              >
                {item.label}
              </button>
            ))}
          </div>
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
      <div style={{ padding: 16, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Sub-tab navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,0,60,0.15)', paddingBottom: 2 }}>
          {[
            { id: 'actions', label: 'QUICK_ACTIONS' },
            { id: 'search', label: 'SMART_SEARCH' },
            { id: 'recent', label: 'RECENT_&_RECYCLE' },
            { id: 'compress', label: 'COMPRESS' },
          ].map(t => (
            <button 
              key={t.id}
              onClick={() => setFileTab(t.id as any)}
              style={{ 
                padding: '6px 10px', background: fileTab === t.id ? 'rgba(255,0,60,0.1)' : 'transparent',
                border: 'none', borderBottom: fileTab === t.id ? '2px solid #ff003c' : '2px solid transparent',
                color: fileTab === t.id ? '#ffb3b2' : '#6a4040', fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {fileTab === 'actions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.12em', marginBottom: 2 }}>
              FILE_MATRIX // FILESYSTEM_INTERFACE
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
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
        )}

        {fileTab === 'search' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b' }}>QUERY:</span>
                <input 
                  value={fileSearchQuery}
                  onChange={e => setFileSearchQuery(e.target.value)}
                  placeholder="Filename..."
                  style={{ width: '100%', padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
                />
              </div>
              <div>
                <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b' }}>EXT:</span>
                <input 
                  value={fileSearchExt}
                  onChange={e => setFileSearchExt(e.target.value)}
                  placeholder="e.g. pdf, txt"
                  style={{ width: '100%', padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b' }}>DAYS_MODIFIED:</span>
                <input 
                  value={fileSearchDays}
                  onChange={e => setFileSearchDays(e.target.value)}
                  placeholder="e.g. 7"
                  type="number"
                  style={{ width: '100%', padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
                />
              </div>
              <div>
                <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b' }}>START_DIR:</span>
                <input 
                  value={fileSearchStartDir}
                  onChange={e => setFileSearchStartDir(e.target.value)}
                  placeholder="e.g. E:/CODING"
                  style={{ width: '100%', padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b' }}>MIN_SIZE:</span>
                <input 
                  value={fileSearchMinSize}
                  onChange={e => setFileSearchMinSize(e.target.value)}
                  placeholder="e.g. 500KB, 1MB"
                  style={{ width: '100%', padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
                />
              </div>
              <div>
                <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b' }}>MAX_SIZE:</span>
                <input 
                  value={fileSearchMaxSize}
                  onChange={e => setFileSearchMaxSize(e.target.value)}
                  placeholder="e.g. 10MB, 2GB"
                  style={{ width: '100%', padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
                />
              </div>
            </div>
            <button
              onClick={async () => {
                setFileSearchBusy(true);
                if (apiAvailable() && window.pywebview!.api.search_files_data) {
                  const days = fileSearchDays ? parseInt(fileSearchDays) : undefined;
                  const res = await window.pywebview!.api.search_files_data(
                    fileSearchStartDir, 
                    fileSearchQuery || undefined, 
                    fileSearchExt || undefined, 
                    days,
                    fileSearchMinSize || undefined,
                    fileSearchMaxSize || undefined
                  );
                  setFileSearchResults(JSON.parse(res));
                }
                setFileSearchBusy(false);
              }}
              disabled={fileSearchBusy}
              style={{ padding: '8px', background: 'rgba(255,0,60,0.15)', border: '1px solid #FF003C', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}
            >
              {fileSearchBusy ? 'SEARCHING...' : 'RUN SMART SEARCH'}
            </button>

            <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,0,60,0.1)', padding: 8, maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(() => {
                const results = Array.isArray(fileSearchResults) ? fileSearchResults : [];
                if (results.length === 0) {
                  return <div style={{ color: '#5f3e3e', fontSize: 9, fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>NO_RESULTS_FOUND</div>;
                }
                return results.map((file, idx) => (
                  <div 
                    key={idx}
                    onClick={() => {
                      setFilePath(file.path);
                      setFileTab('actions');
                    }}
                    style={{ padding: '4px 6px', background: 'rgba(255,255,255,0.02)', fontSize: 9, fontFamily: 'JetBrains Mono', color: '#ffdad8', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.02)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,0,60,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  >
                    <div style={{ fontWeight: 'bold', color: '#ff5577' }}>{file.name}</div>
                    <div style={{ color: '#8f7b7b', fontSize: 8 }}>{file.path} ({Math.round(file.size / 1024)} KB)</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {fileTab === 'recent' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b', marginBottom: 6 }}>RECENT_FILES // Resolved from Recent Folder</div>
              <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,0,60,0.1)', padding: 8, maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(() => {
                  const files = Array.isArray(recentFiles) ? recentFiles : [];
                  if (files.length === 0) {
                    return <div style={{ color: '#5f3e3e', fontSize: 9, fontStyle: 'italic' }}>No recent shortcuts found.</div>;
                  }
                  return files.map((f, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => { setFilePath(f.path); setFileTab('actions'); }}
                      style={{ padding: '2px 4px', color: '#ffdad8', fontSize: 9, fontFamily: 'JetBrains Mono', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,0,60,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {f.name} <span style={{ color: '#5f3e3e', fontSize: 8 }}>({f.path})</span>
                    </div>
                  ));
                })()}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b', marginBottom: 6 }}>RECYCLE_BIN //</div>
              <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,0,60,0.1)', padding: 8, maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(() => {
                  const items = Array.isArray(recycleBin) ? recycleBin : [];
                  if (items.length === 0) {
                    return <div style={{ color: '#5f3e3e', fontSize: 9, fontStyle: 'italic' }}>Recycle Bin is empty.</div>;
                  }
                  return items.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 8, fontFamily: 'JetBrains Mono', padding: '2px 4px' }}>
                      <span style={{ color: '#ffdad8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.original_path}>{item.name}</span>
                      <button 
                        onClick={async () => {
                          if (apiAvailable() && window.pywebview!.api.restore_recycle_bin_item) {
                            const res = await window.pywebview!.api.restore_recycle_bin_item(item.original_path);
                            addMsg('sys', `Restore file: ${res}`);
                            fetchPhaseNineData();
                          }
                        }}
                        style={{ background: 'rgba(0,219,233,0.08)', border: '1px solid rgba(0,219,233,0.2)', color: '#00dbe9', fontSize: 8, fontFamily: 'JetBrains Mono', padding: '1px 4px', cursor: 'pointer' }}
                      >RESTORE</button>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}

        {fileTab === 'compress' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b', marginBottom: 4 }}>COMPRESS_FILES (ZIP) //</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                <input 
                  value={compressFiles}
                  onChange={e => setCompressFiles(e.target.value)}
                  placeholder="Files JSON (e.g. ['E:/a.txt', 'E:/b.txt'])"
                  style={{ padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
                />
                <input 
                  value={compressOutput}
                  onChange={e => setCompressOutput(e.target.value)}
                  placeholder="Output ZIP path (e.g. E:/out.zip)"
                  style={{ padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
                />
              </div>
              <button 
                onClick={async () => {
                  if (!compressFiles || !compressOutput) return;
                  if (apiAvailable() && window.pywebview!.api.zip_files) {
                    const res = await window.pywebview!.api.zip_files(compressFiles, compressOutput);
                    addMsg('sys', `Zip command response: ${res}`);
                    setCompressFiles('');
                    setCompressOutput('');
                    fetchPhaseNineData();
                  }
                }}
                style={{ width: '100%', padding: '8px', background: 'rgba(255,0,60,0.06)', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: 'pointer' }}
              >ZIP FILES</button>
            </div>

            <div style={{ borderTop: '1px dashed rgba(255,0,60,0.15)', paddingTop: 14 }}>
              <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b', marginBottom: 4 }}>DECOMPRESS_ARCHIVE (UNZIP) //</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                <input 
                  value={decompressArchive}
                  onChange={e => setDecompressArchive(e.target.value)}
                  placeholder="ZIP archive path (e.g. E:/out.zip)"
                  style={{ padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
                />
                <input 
                  value={decompressOutput}
                  onChange={e => setDecompressOutput(e.target.value)}
                  placeholder="Output folder path (e.g. E:/extracted)"
                  style={{ padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
                />
              </div>
              <button 
                onClick={async () => {
                  if (!decompressArchive || !decompressOutput) return;
                  if (apiAvailable() && window.pywebview!.api.unzip_files) {
                    const res = await window.pywebview!.api.unzip_files(decompressArchive, decompressOutput);
                    addMsg('sys', `Unzip command response: ${res}`);
                    setDecompressArchive('');
                    setDecompressOutput('');
                    fetchPhaseNineData();
                  }
                }}
                style={{ width: '100%', padding: '8px', background: 'rgba(255,0,60,0.06)', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: 'pointer' }}
              >UNZIP ARCHIVE</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderTodoPanel() {
    const todoList = Array.isArray(todos) ? todos : [];
    const activeTodos = todoList.filter(t => t && !t.completed);
    const completedTodos = todoList.filter(t => t && t.completed);

    const handleAddTodo = async () => {
      const txt = newTodoText.trim();
      if (!txt) return;
      if (apiAvailable()) {
        try {
          const res = await window.pywebview!.api.add_todo(txt);
          if (res === 'ok') {
            setNewTodoText('');
            fetchTodos();
          } else {
            console.error(res);
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        const mockItem = {
          id: Date.now(),
          task: txt,
          completed: 0,
          created_at: new Date().toISOString()
        };
        setTodos(prev => [...prev, mockItem]);
        setNewTodoText('');
      }
    };

    const handleToggleComplete = async (todo: any) => {
      if (apiAvailable()) {
        try {
          const res = await window.pywebview!.api.mark_todo_complete(String(todo.id));
          if (res === 'ok') {
            fetchTodos();
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, completed: 1 } : t));
      }
    };

    const handleDeleteTodo = async (todoId: any) => {
      if (apiAvailable()) {
        try {
          const res = await window.pywebview!.api.delete_todo(String(todoId));
          if (res === 'ok') {
            fetchTodos();
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        setTodos(prev => prev.filter(t => t.id !== todoId));
      }
    };

    return (
      <div style={{ padding: 16, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Sub-tab navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,0,60,0.15)', paddingBottom: 2 }}>
          {[
            { id: 'todo', label: 'TODO_&_FOCUS' },
            { id: 'clipboard', label: 'CLIPBOARD_HISTORY' },
            { id: 'notes', label: 'NOTES_WRITER' },
          ].map(t => (
            <button 
              key={t.id}
              onClick={() => setTodoTab(t.id as any)}
              style={{ 
                padding: '6px 12px', background: todoTab === t.id ? 'rgba(255,0,60,0.1)' : 'transparent',
                border: 'none', borderBottom: todoTab === t.id ? '2px solid #ff003c' : '2px solid transparent',
                color: todoTab === t.id ? '#ffb3b2' : '#6a4040', fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {todoTab === 'todo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.12em', marginBottom: 2 }}>
              TODO_MANAGER // TASK_LEDGER
            </div>

            {/* Pomodoro Focus session widget */}
            <div style={{
              padding: '12px 16px',
              background: 'rgba(255,0,60,0.02)',
              border: '1px solid rgba(255,0,60,0.18)',
              fontFamily: 'JetBrains Mono',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 10, color: '#ffb3b2', fontWeight: 700, letterSpacing: '0.05em' }}>
                  🔴 FOCUS_SESSION_TIMER
                </div>
                {pomodoro.active && (
                  <span className="animate-pulse" style={{ fontSize: 9, color: '#FF003C', fontWeight: 700 }}>
                    RUNNING
                  </span>
                )}
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#ffb3b2', minWidth: 100 }}>
                  {pomodoro.active ? (
                    <span>
                      {Math.floor(pomodoro.remaining / 60).toString().padStart(2, '0')}:{(pomodoro.remaining % 60).toString().padStart(2, '0')}
                    </span>
                  ) : (
                    <span style={{ color: '#7a5555' }}>25:00</span>
                  )}
                </div>
                
                <div style={{ flex: 1, color: '#af8786', fontSize: 10 }}>
                  {pomodoro.active ? (
                    <div>Currently focusing on: <strong style={{ color: '#FF003C' }}>{pomodoro.label}</strong></div>
                  ) : (
                    <div>Start a focus session to boost productivity.</div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {pomodoro.active ? (
                    <button
                      onClick={async () => {
                        if (apiAvailable()) {
                          await window.pywebview!.api.stop_pomodoro();
                        } else {
                          setPomodoro(prev => ({ ...prev, active: false }));
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(255,0,60,0.12)',
                        border: '1px solid #FF003C',
                        color: '#ffb3b2',
                        fontSize: 9,
                        cursor: 'pointer'
                      }}
                    >
                      STOP
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={async () => {
                          if (apiAvailable()) {
                            await window.pywebview!.api.start_pomodoro(1500, 'Focus Session');
                          } else {
                            setPomodoro({ active: true, remaining: 1500, total: 1500, label: 'Focus Session' });
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          background: 'rgba(255,0,60,0.05)',
                          border: '1px solid rgba(255,0,60,0.3)',
                          color: '#ffb3b2',
                          fontSize: 9,
                          cursor: 'pointer'
                        }}
                      >
                        25 MIN
                      </button>
                      <button
                        onClick={async () => {
                          if (apiAvailable()) {
                            await window.pywebview!.api.start_pomodoro(60, 'Quick Test');
                          } else {
                            setPomodoro({ active: true, remaining: 60, total: 60, label: 'Quick Test' });
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          background: 'rgba(0,219,233,0.05)',
                          border: '1px solid rgba(0,219,233,0.3)',
                          color: '#ffb3b2',
                          fontSize: 9,
                          cursor: 'pointer'
                        }}
                      >
                        TEST (1M)
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="Add new task..."
                value={newTodoText}
                onChange={e => setNewTodoText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddTodo(); }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: '#150808',
                  border: '1px solid rgba(255,0,60,0.2)',
                  color: '#ffb3b2',
                  fontFamily: 'JetBrains Mono',
                  fontSize: 11,
                  outline: 'none'
                }}
              />
              <button
                onClick={handleAddTodo}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(255,0,60,0.12)',
                  border: '1px solid rgba(255,0,60,0.3)',
                  color: '#ffb3b2',
                  fontFamily: 'JetBrains Mono',
                  fontSize: 10,
                  cursor: 'pointer'
                }}
              >ADD</button>
            </div>

            <div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#FF003C', letterSpacing: '0.1em', marginBottom: 8, fontWeight: 'bold' }}>
                ACTIVE_TASKS ({activeTodos.length})
              </div>
              {activeTodos.length === 0 ? (
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#7a5555', padding: '8px 12px', background: 'rgba(255,0,60,0.02)', border: '1px dashed rgba(255,0,60,0.15)' }}>
                  No active tasks.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activeTodos.map(todo => (
                    <div
                      key={todo.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'rgba(255,0,60,0.04)',
                        border: '1px solid rgba(255,0,60,0.15)',
                        fontFamily: 'JetBrains Mono',
                        fontSize: 11
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => handleToggleComplete(todo)}
                          style={{ cursor: 'pointer', accentColor: '#FF003C' }}
                        />
                        <span style={{ color: '#ffb3b2' }}>{todo.task}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteTodo(todo.id)}
                        className="material-symbols-outlined"
                        style={{
                          fontSize: 14,
                          color: '#7a5555',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#FF003C'}
                        onMouseLeave={e => e.currentTarget.style.color = '#7a5555'}
                      >
                        delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#00dbe9', letterSpacing: '0.1em', marginBottom: 8, fontWeight: 'bold' }}>
                COMPLETED_TASKS ({completedTodos.length})
              </div>
              {completedTodos.length === 0 ? (
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#55707a', padding: '8px 12px', background: 'rgba(0,219,233,0.02)', border: '1px dashed rgba(0,219,233,0.15)' }}>
                  No completed tasks.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {completedTodos.map(todo => (
                    <div
                      key={todo.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'rgba(0,219,233,0.02)',
                        border: '1px solid rgba(0,219,233,0.12)',
                        fontFamily: 'JetBrains Mono',
                        fontSize: 11,
                        opacity: 0.6
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={true}
                          disabled
                          style={{ cursor: 'default', accentColor: '#00dbe9' }}
                        />
                        <span style={{ color: '#87afaf', textDecoration: 'line-through' }}>{todo.task}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteTodo(todo.id)}
                        className="material-symbols-outlined"
                        style={{
                          fontSize: 14,
                          color: '#55707a',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#FF003C'}
                        onMouseLeave={e => e.currentTarget.style.color = '#55707a'}
                      >
                        delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {todoTab === 'clipboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b' }}>SEARCH:</span>
              <input 
                value={clipSearchQuery}
                onChange={e => setClipSearchQuery(e.target.value)}
                placeholder="Search clipboard history..."
                style={{ flex: 1, padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
              />
              {clipSearchQuery && (
                <button 
                  onClick={() => setClipSearchQuery('')}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#af8786', fontFamily: 'JetBrains Mono', fontSize: 9, padding: '6px 10px', cursor: 'pointer' }}
                >
                  CLEAR
                </button>
              )}
            </div>

            <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,0,60,0.1)', padding: 8, maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(() => {
                const history = Array.isArray(clipboardHistory) ? clipboardHistory : [];
                const filtered = history.filter(c => c && c.content?.toLowerCase().includes(clipSearchQuery.toLowerCase()));
                if (filtered.length === 0) {
                  return <div style={{ color: '#5f3e3e', fontSize: 9, fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>NO_CLIPBOARD_HISTORY_FOUND</div>;
                }
                return filtered.map((item, idx) => (
                  <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,0,60,0.06)', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7, fontFamily: 'JetBrains Mono', color: '#5f3e3e' }}>
                      <span>CLIPBOARD_ITEM //</span>
                      <span>{item.timestamp}</span>
                    </div>
                    <pre style={{ margin: 0, padding: 6, background: '#090303', border: '1px solid rgba(255,255,255,0.02)', color: '#ffdad8', fontSize: 9, fontFamily: 'JetBrains Mono', whiteSpace: 'pre-wrap', maxHeight: 80, overflowY: 'auto' }}>
                      {item.content}
                    </pre>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button 
                        onClick={async () => {
                          if (apiAvailable()) {
                            const res = await window.pywebview!.api.save_chat_log(item.content);
                            addMsg('sys', `Copied to clipboard: ${res}`);
                          }
                        }}
                        style={{ background: 'rgba(0,219,233,0.08)', border: '1px solid rgba(0,219,233,0.2)', color: '#00dbe9', fontSize: 8, fontFamily: 'JetBrains Mono', padding: '2px 6px', cursor: 'pointer' }}
                      >
                        COPY BACK
                      </button>
                      <button 
                        onClick={async () => {
                          if (apiAvailable() && window.pywebview!.api.delete_clipboard_item) {
                            await window.pywebview!.api.delete_clipboard_item(item.content);
                            fetchPhaseNineData();
                          }
                        }}
                        style={{ background: 'rgba(255,0,60,0.08)', border: '1px solid rgba(255,0,60,0.2)', color: '#ff3344', fontSize: 8, fontFamily: 'JetBrains Mono', padding: '2px 6px', cursor: 'pointer' }}
                      >
                        DELETE
                      </button>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {todoTab === 'notes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b' }}>NOTES_EDITOR // Documents/notes.md</span>
              <button 
                onClick={async () => {
                  setNotesSaving(true);
                  if (apiAvailable() && window.pywebview!.api.save_notes_file) {
                    const res = await window.pywebview!.api.save_notes_file(notesText);
                    addMsg('sys', `Notes file saved: ${res}`);
                  }
                  setNotesSaving(false);
                }}
                disabled={notesSaving}
                style={{ 
                  background: 'rgba(255,0,60,0.15)', border: '1px solid #FF003C', color: '#ffb3b2', 
                  fontFamily: 'JetBrains Mono', fontSize: 9, padding: '4px 12px', cursor: 'pointer' 
                }}
              >
                {notesSaving ? 'SAVING...' : 'SAVE NOTES'}
              </button>
            </div>
            <textarea 
              value={notesText}
              onChange={e => setNotesText(e.target.value)}
              style={{ 
                flex: 1, minHeight: 320, padding: 12, background: '#090303', border: '1px solid rgba(255,0,60,0.25)', 
                color: '#ffdad8', fontSize: 10, fontFamily: 'JetBrains Mono', lineHeight: 1.5, resize: 'vertical',
                outline: 'none'
              }}
              placeholder="# Personal Notes..."
            />
          </div>
        )}
      </div>
    );
  }

  function renderSystemPanel() {
    return (
      <div style={{ padding: 16, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Sub-tab navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,0,60,0.15)', paddingBottom: 2 }}>
          <button 
            onClick={() => setSysTab('control')}
            style={{ 
              padding: '6px 12px', background: sysTab === 'control' ? 'rgba(255,0,60,0.1)' : 'transparent',
              border: 'none', borderBottom: sysTab === 'control' ? '2px solid #ff003c' : '2px solid transparent',
              color: sysTab === 'control' ? '#ffb3b2' : '#6a4040', fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            SYSTEM_CONTROL
          </button>
          <button 
            onClick={() => setSysTab('ledger')}
            style={{ 
              padding: '6px 12px', background: sysTab === 'ledger' ? 'rgba(255,0,60,0.1)' : 'transparent',
              border: 'none', borderBottom: sysTab === 'ledger' ? '2px solid #ff003c' : '2px solid transparent',
              color: sysTab === 'ledger' ? '#ffb3b2' : '#6a4040', fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            LEDGER_&_FACTS
          </button>
        </div>

        {sysTab === 'control' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#5f3e3e', letterSpacing: '0.12em', marginBottom: 8 }}>
                SYSTEM_CLI // SHELL_INTERFACE
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                {SYSTEM_ACTIONS.map(a => <PanelButton key={a.label} {...a} />)}
              </div>
            </div>

            {/* Run Command & Powershell Inline Inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#5f3e3e', letterSpacing: '0.1em', marginBottom: 4 }}>
                  RUN_COMMAND //
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    id="sys-cmd-input"
                    placeholder="e.g. ipconfig"
                    style={{ flex: 1, padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
                    onKeyDown={e => { if (e.key === 'Enter') { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (v) { submitCommand(`run command ${v}`); setActiveNav('uplink'); (e.currentTarget as HTMLInputElement).value = ''; } } }}
                  />
                  <button
                    onClick={() => { const el = document.getElementById('sys-cmd-input') as HTMLInputElement; const v = el?.value.trim(); if (v) { submitCommand(`run command ${v}`); setActiveNav('uplink'); el.value = ''; } }}
                    style={{ padding: '6px 12px', background: 'rgba(255,0,60,0.12)', border: '1px solid rgba(255,0,60,0.3)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: 'pointer' }}
                  >RUN</button>
                </div>
              </div>
              <div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#5f3e3e', letterSpacing: '0.1em', marginBottom: 4 }}>
                  RUN_POWERSHELL //
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    id="sys-ps-input"
                    placeholder="e.g. Get-Process"
                    style={{ flex: 1, padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
                    onKeyDown={e => { if (e.key === 'Enter') { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (v) { submitCommand(`run powershell ${v}`); setActiveNav('uplink'); (e.currentTarget as HTMLInputElement).value = ''; } } }}
                  />
                  <button
                    onClick={() => { const el = document.getElementById('sys-ps-input') as HTMLInputElement; const v = el?.value.trim(); if (v) { submitCommand(`run powershell ${v}`); setActiveNav('uplink'); el.value = ''; } }}
                    style={{ padding: '6px 12px', background: 'rgba(255,0,60,0.12)', border: '1px solid rgba(255,0,60,0.3)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: 'pointer' }}
                  >RUN PS</button>
                </div>
              </div>
            </div>

            {/* Battery status */}
            {batteryStatus && batteryStatus.present && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(255,0,60,0.04)', border: '1px solid rgba(255,0,60,0.12)', padding: '6px 10px', fontSize: 9, fontFamily: 'JetBrains Mono', color: '#ffb3b2' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ff003c' }}>battery_charging_full</span>
                <span>BATTERY: {batteryStatus.percent}% ({batteryStatus.power_plugged ? 'CHARGING' : 'DISCHARGING'})</span>
                {batteryStatus.secsleft > 0 && (
                  <span style={{ color: '#8f7b7b', marginLeft: 'auto' }}>
                    REMAINING: {Math.round(batteryStatus.secsleft / 60)} MINS
                  </span>
                )}
              </div>
            )}

            {/* CPU/RAM Top Consuming Processes */}
            {(() => {
              const hogs = resourceHogs || { cpu: [], memory: [] };
              const cpuList = Array.isArray(hogs.cpu) ? hogs.cpu : [];
              const memList = Array.isArray(hogs.memory) ? hogs.memory : [];
              if (cpuList.length === 0 && memList.length === 0) return null;
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,0,60,0.1)', padding: 8 }}>
                    <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b', marginBottom: 4, borderBottom: '1px solid rgba(255,0,60,0.15)', paddingBottom: 2 }}>TOP_CPU_CONSUMERS</div>
                    {cpuList.map((p, i) => (
                      <div key={`${p.pid}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, fontFamily: 'JetBrains Mono', color: '#ffb3b2', padding: '1px 0' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }} title={p.name}>{p.name}</span>
                        <span style={{ color: '#ff5566' }}>{p.cpu}%</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,0,60,0.1)', padding: 8 }}>
                    <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#8f7b7b', marginBottom: 4, borderBottom: '1px solid rgba(255,0,60,0.15)', paddingBottom: 2 }}>TOP_RAM_CONSUMERS</div>
                    {memList.map((p, i) => (
                      <div key={`${p.pid}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, fontFamily: 'JetBrains Mono', color: '#ffb3b2', padding: '1px 0' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }} title={p.name}>{p.name}</span>
                        <span style={{ color: '#00dbe9' }}>{p.mem_mb}M</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Brightness Slider */}
            <div>
              <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#5f3e3e', marginBottom: 4 }}>SCREEN_BRIGHTNESS //</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  defaultValue="60"
                  onMouseUp={async (e) => {
                    const val = e.currentTarget.value;
                    submitCommand(`set screen brightness to ${val}%`);
                    setActiveNav('uplink');
                  }}
                  style={{ flex: 1, accentColor: '#ff003c', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#ffb3b2' }}>WMI</span>
              </div>
            </div>

            {/* Scheduled Power Controls */}
            <div>
              <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#5f3e3e', marginBottom: 4 }}>DEFERRED_POWER_COMMANDS //</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono', color: '#8f7b7b' }}>DELAY (S):</span>
                <input 
                  id="power-delay" 
                  type="number" 
                  defaultValue="10" 
                  style={{ width: 50, padding: '4px 6px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 9, outline: 'none' }}
                />
                <button 
                  onClick={() => {
                    const delay = (document.getElementById('power-delay') as HTMLInputElement)?.value || '10';
                    submitCommand(`shutdown in ${delay} seconds`);
                    setActiveNav('uplink');
                  }}
                  style={{ flex: 1, padding: '6px', background: 'rgba(255,0,60,0.06)', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: 'pointer' }}
                >SHUTDOWN</button>
                <button 
                  onClick={() => {
                    const delay = (document.getElementById('power-delay') as HTMLInputElement)?.value || '10';
                    submitCommand(`restart in ${delay} seconds`);
                    setActiveNav('uplink');
                  }}
                  style={{ flex: 1, padding: '6px', background: 'rgba(255,0,60,0.06)', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: 'pointer' }}
                >RESTART</button>
                <button 
                  onClick={() => {
                    const delay = (document.getElementById('power-delay') as HTMLInputElement)?.value || '10';
                    submitCommand(`sleep in ${delay} seconds`);
                    setActiveNav('uplink');
                  }}
                  style={{ flex: 1, padding: '6px', background: 'rgba(255,0,60,0.06)', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: 'pointer' }}
                >SLEEP</button>
              </div>
            </div>

            {/* WiFi & Bluetooth Profiles */}
            <div>
              <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#5f3e3e', marginBottom: 4 }}>NETWORKS_AND_WIRELESS //</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button 
                  onClick={() => { submitCommand("connect to wifi"); setActiveNav('uplink'); }}
                  style={{ padding: '8px', background: 'rgba(255,0,60,0.06)', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: 'pointer' }}
                >⚡ LIST WIFI PROFILES</button>
                <button 
                  onClick={() => { submitCommand("list bluetooth devices"); setActiveNav('uplink'); }}
                  style={{ padding: '8px', background: 'rgba(255,0,60,0.06)', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: 'pointer' }}
                >⚡ LIST BLUETOOTH DEVICES</button>
              </div>
            </div>

            {/* Registry Startup Manager */}
            <div>
              <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#5f3e3e', marginBottom: 6 }}>REGISTRY_STARTUP_LIST //</div>
              <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,0,60,0.1)', padding: 8, maxHeight: 110, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {(() => {
                  const apps = Array.isArray(startupApps) ? startupApps : [];
                  if (apps.length === 0) {
                    return <div style={{ color: '#5f3e3e', fontSize: 9, fontStyle: 'italic' }}>No startup registry entries found.</div>;
                  }
                  return apps.map(app => (
                    <div key={app.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 8, fontFamily: 'JetBrains Mono' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input 
                          type="checkbox" 
                          defaultChecked={true}
                          onChange={async (e) => {
                            const checked = e.target.checked;
                            if (apiAvailable() && window.pywebview!.api.toggle_startup_app) {
                              const res = await window.pywebview!.api.toggle_startup_app(app.name, checked, app.path);
                              addMsg('sys', `Toggle startup app '${app.name}': ${res}`);
                              fetchPhaseNineData();
                            }
                          }}
                          style={{ cursor: 'pointer', accentColor: '#ff003c' }}
                        />
                        <span style={{ color: '#ffb3b2' }}>{app.name}</span>
                      </div>
                      <span style={{ color: '#5f3e3e', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={app.path}>{app.path}</span>
                    </div>
                  ));
                })()}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input 
                  value={newStartupName}
                  onChange={e => setNewStartupName(e.target.value)}
                  placeholder="App Name"
                  style={{ flex: 1, padding: '4px 6px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 9, outline: 'none' }}
                />
                <input 
                  value={newStartupPath}
                  onChange={e => setNewStartupPath(e.target.value)}
                  placeholder="Executable Path"
                  style={{ flex: 2, padding: '4px 6px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 9, outline: 'none' }}
                />
                <button 
                  onClick={async () => {
                    if (!newStartupName || !newStartupPath) return;
                    if (apiAvailable() && window.pywebview!.api.toggle_startup_app) {
                      const res = await window.pywebview!.api.toggle_startup_app(newStartupName, true, newStartupPath);
                      addMsg('sys', `Added startup app '${newStartupName}': ${res}`);
                      setNewStartupName('');
                      setNewStartupPath('');
                      fetchPhaseNineData();
                    }
                  }}
                  style={{ padding: '4px 10px', background: 'rgba(255,0,60,0.12)', border: '1px solid rgba(255,0,60,0.3)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: 'pointer' }}
                >ADD</button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Visual Execution Ledger */}
            <div>
              <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#5f3e3e', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>EXECUTION_LEDGER // SQLITE_AUDIT</span>
                <button 
                  onClick={async () => {
                    if (apiAvailable() && window.pywebview!.api.undo_last_action) {
                      const res = await window.pywebview!.api.undo_last_action();
                      addMsg('sys', `Undo response: ${res}`);
                      fetchPhaseNineData();
                    }
                  }}
                  style={{ background: 'rgba(255,0,60,0.15)', border: '1px solid #FF003C', color: '#FF003C', fontFamily: 'JetBrains Mono', fontSize: 9, padding: '2px 8px', cursor: 'pointer' }}
                >
                  UNDO LAST ACTION
                </button>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,0,60,0.1)', padding: 8, maxHeight: 210, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(() => {
                  const ledger = Array.isArray(executionLedger) ? executionLedger : [];
                  if (ledger.length === 0) {
                    return <div style={{ color: '#5f3e3e', fontSize: 9, fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>NO_EXECUTIONS_RECORDED</div>;
                  }
                  return ledger.map((row, idx) => (
                    <div key={`${row.id}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'JetBrains Mono' }}>
                        <span style={{ color: '#ff5577', fontWeight: 'bold' }}>{row.action_type}</span>
                        <span style={{ color: '#5f3e3e' }}>{row.timestamp}</span>
                      </div>
                      <div style={{ fontSize: 8, fontFamily: 'JetBrains Mono', color: '#8f7b7b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Value: {row.value}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 8, fontFamily: 'JetBrains Mono' }}>
                        <span style={{ color: row.result?.toLowerCase().startsWith('error') ? '#ff3344' : '#00ff99' }}>{row.result}</span>
                        <button 
                          onClick={async () => {
                            if (apiAvailable() && window.pywebview!.api.replay_ledger_action) {
                              const res = await window.pywebview!.api.replay_ledger_action(row.id);
                              addMsg('sys', `Replaying action ${row.id}: ${res}`);
                              fetchPhaseNineData();
                            }
                          }}
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#ffb3b2', fontSize: 8, padding: '1px 4px', cursor: 'pointer' }}
                        >
                          REPLAY
                        </button>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Local Fact-Memory Manager */}
            <div>
              <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#5f3e3e', marginBottom: 6 }}>LOCAL_MEMORIES // KEY_FREE_FACTS</div>
              <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,0,60,0.1)', padding: 8, maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {(() => {
                  const factList = Array.isArray(facts) ? facts : [];
                  if (factList.length === 0) {
                    return <div style={{ color: '#5f3e3e', fontSize: 9, fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>NO_FACTS_STORED</div>;
                  }
                  return factList.map(fact => (
                    <div key={fact} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 8, fontFamily: 'JetBrains Mono', borderBottom: '1px solid rgba(255,255,255,0.01)', paddingBottom: 2 }}>
                      <span style={{ color: '#ffdad8', flex: 1 }}>{fact}</span>
                      <button 
                        onClick={async () => {
                          if (apiAvailable() && window.pywebview!.api.delete_fact) {
                            const res = await window.pywebview!.api.delete_fact(fact);
                            addMsg('sys', `Deleted fact: ${res}`);
                            fetchPhaseNineData();
                          }
                        }}
                        style={{ background: 'none', border: 'none', color: '#ff3344', cursor: 'pointer', fontSize: 8, fontFamily: 'JetBrains Mono' }}
                      >DELETE</button>
                    </div>
                  ));
                })()}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input 
                  value={newFactText}
                  onChange={e => setNewFactText(e.target.value)}
                  placeholder="Enter new fact (e.g. My workspace path is E:/coding)"
                  style={{ flex: 1, padding: '6px 10px', background: '#150808', border: '1px solid rgba(255,0,60,0.2)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 10, outline: 'none' }}
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && newFactText.trim()) {
                      if (apiAvailable() && window.pywebview!.api.save_fact) {
                        const res = await window.pywebview!.api.save_fact(newFactText.trim());
                        addMsg('sys', `Saved fact: ${res}`);
                        setNewFactText('');
                        fetchPhaseNineData();
                      }
                    }
                  }}
                />
                <button 
                  onClick={async () => {
                    if (!newFactText.trim()) return;
                    if (apiAvailable() && window.pywebview!.api.save_fact) {
                      const res = await window.pywebview!.api.save_fact(newFactText.trim());
                      addMsg('sys', `Saved fact: ${res}`);
                      setNewFactText('');
                      fetchPhaseNineData();
                    }
                  }}
                  style={{ padding: '6px 12px', background: 'rgba(255,0,60,0.12)', border: '1px solid rgba(255,0,60,0.3)', color: '#ffb3b2', fontFamily: 'JetBrains Mono', fontSize: 9, cursor: 'pointer' }}
                >SAVE</button>
              </div>
            </div>
          </div>
        )}
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
      case 'todo': return renderTodoPanel();
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
              <div style={{ fontSize: 12, fontWeight: 700, color: '#00dbe9', marginBottom: 6 }}>
                {s.is_multi_step ? '💡 MULTI-STEP TASK COMPLETED' : '🧠 REPETITIVE TASK DETECTED'}
              </div>
              <div style={{ fontSize: 10, color: '#ffdad8', marginBottom: 6 }}>
                {s.is_multi_step ? 'Would you like to save this task as a custom macro?' : `You've run this sequence ${s.frequency} times:`}
              </div>
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

      {/* ═══ ADD CUSTOM APP MODAL ═════════════════════════════════════ */}
      {showAddAppModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ padding: 24, background: '#150808', border: '1px solid rgba(255,0,60,0.35)', fontFamily: 'JetBrains Mono', maxWidth: 450, width: '90%' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ffb3b2', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ff525c' }}>add_box</span>
              UPLINK NEW APPLICATION VERB
            </div>

            {addAppError && (
              <div style={{ background: 'rgba(255,0,60,0.1)', border: '1px solid rgba(255,0,60,0.3)', color: '#ff8888', padding: '8px 10px', fontSize: 10, marginBottom: 12 }}>
                {addAppError}
              </div>
            )}

            {!showCustomAppFallback ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: '#ffb3b2', letterSpacing: '0.1em', marginBottom: 6 }}>SELECT INSTALLED APP FROM SYSTEM</div>
                <select
                  value={selectedInstalledApp}
                  onChange={e => setSelectedInstalledApp(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', background: '#0d0505',
                    border: '1px solid rgba(255,0,60,0.25)', color: '#ffdad8',
                    fontFamily: 'JetBrains Mono', fontSize: 11, outline: 'none',
                    boxSizing: 'border-box', cursor: 'pointer'
                  }}
                >
                  <option value="">-- Choose Installed Application --</option>
                  {installedApps.map(app => (
                    <option key={app.name} value={app.name}>
                      {app.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, color: '#ffb3b2', letterSpacing: '0.1em', marginBottom: 6 }}>APPLICATION LABEL (NAME)</div>
                  <input
                    type="text"
                    value={newAppLabel}
                    onChange={e => setNewAppLabel(e.target.value)}
                    placeholder="e.g. My Text Editor"
                    style={{
                      width: '100%', padding: '8px 10px', background: '#0d0505',
                      border: '1px solid rgba(255,0,60,0.25)', color: '#ffdad8',
                      fontFamily: 'JetBrains Mono', fontSize: 11, outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, color: '#ffb3b2', letterSpacing: '0.1em', marginBottom: 6 }}>EXECUTABLE PATH OR SYSTEM COMMAND</div>
                  <input
                    type="text"
                    value={newAppPath}
                    onChange={e => setNewAppPath(e.target.value)}
                    placeholder="e.g. notepad, chrome, or C:\Path\to\app.exe"
                    style={{
                      width: '100%', padding: '8px 10px', background: '#0d0505',
                      border: '1px solid rgba(255,0,60,0.25)', color: '#ffdad8',
                      fontFamily: 'JetBrains Mono', fontSize: 11, outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <input 
                type="checkbox"
                id="custom-app-fallback-chk"
                checked={showCustomAppFallback}
                onChange={e => {
                  setShowCustomAppFallback(e.target.checked);
                  setAddAppError('');
                }}
                style={{ cursor: 'pointer', accentColor: '#ff003c' }}
              />
              <label htmlFor="custom-app-fallback-chk" style={{ fontSize: 10, color: '#8f7b7b', fontFamily: 'JetBrains Mono', cursor: 'pointer' }}>
                Add Custom Path and Label (Fallback)
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                onClick={handleAddAppSubmit} 
                style={{ flex: 1, padding: '10px', background: 'rgba(255,0,60,0.15)', border: '1px solid rgba(255,0,60,0.4)', color: '#ff525c', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700 }}
              >
                UPLINK
              </button>
              <button 
                onClick={() => { setShowAddAppModal(false); setAddAppError(''); setSelectedInstalledApp(''); setShowCustomAppFallback(false); }} 
                style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(154,112,112,0.4)', color: '#9a7070', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 11 }}
              >
                CANCEL
              </button>
            </div>
          </div>
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
              {pomodoro.active && (
                <div className="flex items-center gap-2 px-2 py-0.5" style={{ fontFamily: 'JetBrains Mono', fontSize: 9, background: 'rgba(255,0,60,0.1)', border: '1px solid rgba(255,0,60,0.3)' }}>
                  <span className="material-symbols-outlined animate-pulse" style={{ fontSize: 11, color: '#FF003C', verticalAlign: 'middle' }}>alarm</span>
                  <span style={{ color: '#ffb3b2', fontWeight: 700 }}>
                    {pomodoro.label.toUpperCase()}: {Math.floor(pomodoro.remaining / 60).toString().padStart(2, '0')}:{(pomodoro.remaining % 60).toString().padStart(2, '0')}
                  </span>
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
                          activeNav === 'system' ? 'SYSTEM_CLI' :
                            activeNav === 'todo' ? 'TODO_MANAGER' : 'COMMS_WEB'}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
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

                {/* Macro Recommendations Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#ffb3b2' }}>MACRO RECOMMENDATIONS</div>
                    <div style={{ fontSize: 9, color: '#9a7070' }}>Show suggestion popups for repetitive actions</div>
                  </div>
                  <button
                    onClick={async () => {
                      const currentVal = profile.macro_recommendations_enabled !== 'false';
                      const newVal = !currentVal;
                      setProfile(p => ({ ...p, macro_recommendations_enabled: String(newVal) }));
                      setProfileDraft(d => ({ ...d, macro_recommendations_enabled: String(newVal) }));
                      if (apiAvailable()) {
                        await window.pywebview!.api.set_profile('macro_recommendations_enabled', String(newVal));
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      background: (profile.macro_recommendations_enabled !== 'false') ? 'rgba(0,219,233,0.15)' : 'rgba(154,112,112,0.15)',
                      border: (profile.macro_recommendations_enabled !== 'false') ? '1px solid #00dbe9' : '1px solid #8a6060',
                      color: (profile.macro_recommendations_enabled !== 'false') ? '#00dbe9' : '#8a6060',
                      fontFamily: 'JetBrains Mono', fontSize: 10, cursor: 'pointer', fontWeight: 700
                    }}
                  >
                    {(profile.macro_recommendations_enabled !== 'false') ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                {/* Macro Recommendation Thresholds */}
                {profile.macro_recommendations_enabled !== 'false' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20, padding: 10, background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,0,60,0.08)' }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#ffdad8', letterSpacing: '0.1em', marginBottom: 4 }}>MIN FREQUENCY</div>
                      <select
                        value={profile.macro_min_freq || '3'}
                        onChange={async (e) => {
                          const val = e.target.value;
                          setProfile(p => ({ ...p, macro_min_freq: val }));
                          setProfileDraft(d => ({ ...d, macro_min_freq: val }));
                          if (apiAvailable()) {
                            await window.pywebview!.api.set_profile('macro_min_freq', val);
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          background: '#0d0505',
                          border: '1px solid rgba(255,0,60,0.25)',
                          color: '#ffdad8',
                          fontFamily: 'JetBrains Mono',
                          fontSize: 10,
                          outline: 'none',
                        }}
                      >
                        <option value="2">2 repeats</option>
                        <option value="3">3 repeats (Default)</option>
                        <option value="5">5 repeats</option>
                        <option value="10">10 repeats</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#ffdad8', letterSpacing: '0.1em', marginBottom: 4 }}>MAX INTERVAL</div>
                      <select
                        value={profile.macro_timeout_sec || '180'}
                        onChange={async (e) => {
                          const val = e.target.value;
                          setProfile(p => ({ ...p, macro_timeout_sec: val }));
                          setProfileDraft(d => ({ ...d, macro_timeout_sec: val }));
                          if (apiAvailable()) {
                            await window.pywebview!.api.set_profile('macro_timeout_sec', val);
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          background: '#0d0505',
                          border: '1px solid rgba(255,0,60,0.25)',
                          color: '#ffdad8',
                          fontFamily: 'JetBrains Mono',
                          fontSize: 10,
                          outline: 'none',
                        }}
                      >
                        <option value="60">1 minute</option>
                        <option value="180">3 minutes (Default)</option>
                        <option value="300">5 minutes</option>
                        <option value="600">10 minutes</option>
                        <option value="1800">30 minutes</option>
                      </select>
                    </div>
                  </div>
                )}

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
