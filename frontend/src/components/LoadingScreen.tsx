import { useEffect, useRef } from 'react';

interface Props {
  onComplete: () => void;
}

const LOGS = [
  'BYPASSING NEURAL FILTERS...',
  'ESTABLISHING SECURE CONNECTION...',
  'SYNCHRONIZING CORE MEMORY...',
  'OVERRIDING SYSTEM LOCKS...',
  'AWAITING MANUAL OVERRIDE.',
];

export default function LoadingScreen({ onComplete }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const logRef     = useRef<HTMLDivElement>(null);
  const rafRef     = useRef<number>(0);
  const latencyRef = useRef<HTMLSpanElement>(null);
  const statusRef  = useRef<HTMLDivElement>(null);

  /* WebGL Shader */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function syncSize() {
      if (!canvas) return;
      const w = canvas.clientWidth  || 1280;
      const h = canvas.clientHeight || 720;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncSize) : null;
    ro?.observe(canvas);
    syncSize();

    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return;

    const vs = `attribute vec2 a_position;varying vec2 v_tc;void main(){v_tc=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
    const fs = `precision highp float;
uniform float u_time;uniform vec2 u_res;uniform vec2 u_mouse;varying vec2 v_tc;
void main(){
  vec2 p=(gl_FragCoord.xy*2.-u_res)/min(u_res.x,u_res.y);
  float d=length(p),glow=.05/(d*d+.01);
  float ang=atan(p.y,p.x),dist=d;
  float r1=smoothstep(.4,.41,dist)*smoothstep(.45,.44,dist)*step(.2,fract(ang*3./6.2831+u_time*.2));
  float r2=smoothstep(.5,.51,dist)*smoothstep(.53,.52,dist)*step(.5,fract(ang*8./6.2831-u_time*.5));
  vec3 col=vec3(1.,0.,.235)+vec3(0.,.94,1.)*r1+vec3(0.,1.,.61)*r2+vec3(1.,0.,.235)*glow;
  col+=smoothstep(.9,1.,sin(v_tc.y*100.+u_time*5.))*.1;
  gl_FragColor=vec4(col,1.);
}`;

    function mkShader(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src); gl!.compileShader(s); return s;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, mkShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const uTime  = gl.getUniformLocation(prog, 'u_time');
    const uRes   = gl.getUniformLocation(prog, 'u_res');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');
    let mouse = { x: canvas.width/2, y: canvas.height/2 };
    const onMouse = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      if (r.width && r.height) { mouse.x = (e.clientX - r.left)/r.width*canvas.width; mouse.y = (1-(e.clientY-r.top)/r.height)*canvas.height; }
    };
    window.addEventListener('mousemove', onMouse);

    function render(t: number) {
      syncSize();
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      if (uTime)  gl!.uniform1f(uTime, t * 0.001);
      if (uRes)   gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      if (uMouse) gl!.uniform2f(uMouse, mouse.x, mouse.y);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      rafRef.current = requestAnimationFrame(render);
    }
    render(0);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', onMouse);
      ro?.disconnect();
    };
  }, []);

  /* Typewriter logs */
  useEffect(() => {
    let idx = 0;
    function addLog() {
      const container = logRef.current;
      if (!container || idx >= LOGS.length) return;
      const prev = container.lastElementChild as HTMLElement | null;
      if (prev) {
        prev.classList.remove('typewriter');
        prev.style.animation = 'none';
        prev.style.borderRight = 'none';
        prev.style.opacity = '0.45';
        prev.style.color = '#af8786';
      }
      const el = document.createElement('div');
      el.className = 'typewriter text-primary';
      el.style.cssText = 'font-size:11px;color:#ffb3b2;width:100%';
      el.textContent = LOGS[idx];
      container.appendChild(el);
      while (container.children.length > 4) container.removeChild(container.firstChild!);
      idx++;
      if (idx < LOGS.length) setTimeout(addLog, 1800 + Math.random() * 900);
    }
    const t = setTimeout(addLog, 1500);
    return () => clearTimeout(t);
  }, []);

  /* Latency flicker */
  useEffect(() => {
    const id = setInterval(() => {
      if (latencyRef.current) latencyRef.current.textContent = (8 + Math.floor(Math.random() * 14)) + 'ms';
    }, 1400);
    return () => clearInterval(id);
  }, []);

  function handleUplink() {
    if (statusRef.current) {
      statusRef.current.style.color = '#19ff9d';
      statusRef.current.textContent = 'UPLINK STATUS: CONNECTED';
    }
    setTimeout(onComplete, 500);
  }

  return (
    <div className="fixed inset-0 overflow-hidden flex flex-col items-center justify-center" style={{ background: '#210e0e' }}>

      {/* WebGL Background */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ opacity: 0.6, mixBlendMode: 'screen' }} />

      {/* Scanlines */}
      <div className="absolute inset-0 scanline-overlay opacity-40 pointer-events-none" style={{ zIndex: 1 }} />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1, background: 'radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(33,14,14,0.75) 100%)' }} />

      {/* Top Left */}
      <div className="absolute top-8 left-8 opacity-70" style={{ zIndex: 2 }}>
        <div className="flex items-center gap-2" style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: '#ffb3b2', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>terminal</span>
          SYS.REQ_ID: RAGE-99X
        </div>
        <div ref={statusRef} style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#00dbe9', marginTop: 4, letterSpacing: '0.05em' }}>
          UPLINK STATUS: PENDING...
        </div>
      </div>

      {/* Top Right */}
      <div className="absolute top-8 right-8 opacity-70 flex items-center gap-2" style={{ zIndex: 2, fontFamily: 'JetBrains Mono', fontSize: 11, color: '#f5fff4' }}>
        LATENCY: <span ref={latencyRef}>12ms</span>
        <span className="material-symbols-outlined animate-pulse" style={{ fontSize: 14, color: '#19ff9d' }}>network_ping</span>
      </div>

      {/* Central Display */}
      <div className="relative flex items-center justify-center" style={{ zIndex: 2, width: 380, height: 380 }}>
        {/* Rings */}
        <div className="absolute inset-0 rounded-full spin-slow" style={{ border: '1px solid rgba(255,179,178,0.15)', borderTopColor: 'rgba(255,179,178,0.8)' }} />
        <div className="absolute rounded-full spin-ccw" style={{ inset: 16, border: '1px solid rgba(245,255,244,0.08)', borderBottomColor: 'rgba(245,255,244,0.6)', borderLeftColor: 'rgba(245,255,244,0.25)' }} />
        <div className="absolute rounded-full spin-slow" style={{ inset: 32, border: '1px solid rgba(0,219,233,0.15)', borderRightColor: 'rgba(0,219,233,0.7)', animationDuration: '14s' }} />
        {/* Core glow */}
        <div className="absolute inset-0 rounded-full animate-pulse" style={{ background: 'rgba(255,0,60,0.06)', filter: 'blur(24px)' }} />
        {/* RAGE text */}
        <div className="relative flex flex-col items-center" style={{ zIndex: 10 }}>
          <h1
            className="glitch-text"
            data-text="RAGE"
            style={{ fontFamily: 'Space Grotesk', fontSize: 80, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.04em', color: '#ffb3b2', textShadow: '0 0 30px rgba(255,179,178,0.9)', margin: 0 }}
          >RAGE</h1>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.3em', color: '#e9bcba', marginTop: 10, padding: '4px 12px', background: 'rgba(46,26,26,0.55)', border: '1px solid rgba(95,62,62,0.35)', backdropFilter: 'blur(8px)' }}>
            NEURAL CORE
          </div>
        </div>
      </div>

      {/* System Log Console */}
      <div className="relative" style={{ zIndex: 2, width: 480, marginTop: 28, height: 120, background: 'rgba(26,9,9,0.65)', border: '1px solid rgba(255,179,178,0.2)', backdropFilter: 'blur(16px)' }}>
        <div className="absolute top-0 left-0 w-full" style={{ height: 1, background: 'linear-gradient(to right, transparent, rgba(255,179,178,0.5), transparent)' }} />
        <div className="p-4 h-full flex flex-col justify-end overflow-hidden" ref={logRef} />
        <div className="absolute top-2 right-2 text-right" style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(233,188,186,0.3)', lineHeight: 1.6 }}>
          <div>0x8F9A</div><div>0x11B2</div><div>0xFA4C</div>
        </div>
      </div>

      {/* Initiate Button */}
      <div style={{ zIndex: 2, marginTop: 36 }}>
        <button onClick={handleUplink} className="btn-crimson cyber-chamfer flex items-center gap-2" style={{ padding: '14px 36px', fontSize: 12 }}>
          <div className="sweep" />
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>bolt</span>
          INITIATE UPLINK
        </button>
      </div>

      {/* Bottom deco */}
      <div className="absolute bottom-4 left-8 right-8 flex justify-between items-end opacity-50 pointer-events-none" style={{ zIndex: 2 }}>
        <div style={{ width: 128, height: 3, background: 'linear-gradient(to right, #FF003C, transparent)' }} />
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#e9bcba', textAlign: 'right', lineHeight: 1.7 }}>
          SYSTEM VERSION: 4.2.0<br />ENCRYPTION: QUANTUM-LEVEL
        </div>
      </div>
    </div>
  );
}
