import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface GlobeProps {
  onReady: () => void;
}

export default function GlobeCanvas({ onReady }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  // Dynamically generate a premium soft-glow point texture
  const createPointGlowTexture = (colorHex: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, colorHex);
    grad.addColorStop(0.25, colorHex.replace(')', ', 0.5)').replace('rgb', 'rgba'));
    grad.addColorStop(0.6, colorHex.replace(')', ', 0.15)').replace('rgb', 'rgba'));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050202, 0.08);

    // --- Camera Setup ---
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.z = 8;

    // --- Renderer Setup ---
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);

    // --- Glow Textures ---
    const crimsonGlow = createPointGlowTexture('rgb(255, 0, 60)');
    const cyanGlow = createPointGlowTexture('rgb(0, 240, 255)');

    // --- Group Hierarchy ---
    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    // 1. Outer Shell: Electric Crimson Wireframe Icosahedron
    const outerGeo = new THREE.IcosahedronGeometry(2.2, 2);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xff003c,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
    });
    const outerShell = new THREE.Mesh(outerGeo, outerMat);
    mainGroup.add(outerShell);

    // 2. Inner Nucleus: Holographic Cyber Lime / Cyan Sphere
    const nucleusGeo = new THREE.SphereGeometry(1.1, 32, 32);
    const nucleusMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
    });
    const nucleus = new THREE.Mesh(nucleusGeo, nucleusMat);
    mainGroup.add(nucleus);

    // Dense inner point core inside the nucleus
    const corePointsCount = 150;
    const coreGeo = new THREE.BufferGeometry();
    const corePositions = new Float32Array(corePointsCount * 3);
    const coreRandomData = new Float32Array(corePointsCount); // for individual animations

    for (let i = 0; i < corePointsCount; i++) {
      // Uniform distribution in sphere
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * 0.95; // Radius up to 0.95

      corePositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      corePositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      corePositions[i * 3 + 2] = r * Math.cos(phi);
      coreRandomData[i] = Math.random();
    }
    coreGeo.setAttribute('position', new THREE.BufferAttribute(corePositions, 3));
    
    const coreMat = new THREE.PointsMaterial({
      size: 0.12,
      map: cyanGlow,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const corePoints = new THREE.Points(coreGeo, coreMat);
    mainGroup.add(corePoints);

    // 3. Synaptic Nodes: Procedural glowing particles
    const nodesCount = 200;
    const nodesGeo = new THREE.BufferGeometry();
    const nodesPositions = new Float32Array(nodesCount * 3);
    const nodeSpeeds = new Float32Array(nodesCount);
    const nodePhases = new Float32Array(nodesCount);

    for (let i = 0; i < nodesCount; i++) {
      // Distribute points on outer radius
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 2.15; // Slightly inside outer shell

      nodesPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      nodesPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      nodesPositions[i * 3 + 2] = r * Math.cos(phi);

      nodeSpeeds[i] = 0.5 + Math.random() * 1.5;
      nodePhases[i] = Math.random() * Math.PI * 2;
    }
    nodesGeo.setAttribute('position', new THREE.BufferAttribute(nodesPositions, 3));

    const nodesMat = new THREE.PointsMaterial({
      size: 0.16,
      map: crimsonGlow,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const synapticNodes = new THREE.Points(nodesGeo, nodesMat);
    mainGroup.add(synapticNodes);

    // 4. Orbital Rings: Two counter-rotating dotted rings
    const ring1Count = 160;
    const ring1Geo = new THREE.BufferGeometry();
    const ring1Positions = new Float32Array(ring1Count * 3);
    for (let i = 0; i < ring1Count; i++) {
      const angle = (i / ring1Count) * Math.PI * 2;
      ring1Positions[i * 3] = Math.cos(angle) * 2.7;
      ring1Positions[i * 3 + 1] = 0;
      ring1Positions[i * 3 + 2] = Math.sin(angle) * 2.7;
    }
    ring1Geo.setAttribute('position', new THREE.BufferAttribute(ring1Positions, 3));
    const ring1Mat = new THREE.PointsMaterial({
      size: 0.08,
      map: cyanGlow,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const orbitalRing1 = new THREE.Points(ring1Geo, ring1Mat);
    orbitalRing1.rotation.x = Math.PI / 4;
    orbitalRing1.rotation.y = Math.PI / 6;
    mainGroup.add(orbitalRing1);

    const ring2Count = 120;
    const ring2Geo = new THREE.BufferGeometry();
    const ring2Positions = new Float32Array(ring2Count * 3);
    for (let i = 0; i < ring2Count; i++) {
      const angle = (i / ring2Count) * Math.PI * 2;
      ring2Positions[i * 3] = Math.cos(angle) * 3.1;
      ring2Positions[i * 3 + 1] = 0;
      ring2Positions[i * 3 + 2] = Math.sin(angle) * 3.1;
    }
    ring2Geo.setAttribute('position', new THREE.BufferAttribute(ring2Positions, 3));
    const ring2Mat = new THREE.PointsMaterial({
      size: 0.08,
      map: crimsonGlow,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const orbitalRing2 = new THREE.Points(ring2Geo, ring2Mat);
    orbitalRing2.rotation.x = -Math.PI / 3;
    orbitalRing2.rotation.z = Math.PI / 4;
    mainGroup.add(orbitalRing2);

    // 5. Connective lines: Faint lines between nearby synaptic nodes
    const linesCount = 40;
    const linesGeo = new THREE.BufferGeometry();
    const linesPositions = new Float32Array(linesCount * 2 * 3);
    // Set initial layout
    linesGeo.setAttribute('position', new THREE.BufferAttribute(linesPositions, 3));
    const linesMat = new THREE.LineBasicMaterial({
      color: 0xff003c,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
    });
    const nodeConnections = new THREE.LineSegments(linesGeo, linesMat);
    mainGroup.add(nodeConnections);

    // Helper to update connection lines based on nearest nodes
    const updateConnections = () => {
      const posAttr = nodesGeo.getAttribute('position') as THREE.BufferAttribute;
      const linePosAttr = linesGeo.getAttribute('position') as THREE.BufferAttribute;
      let lineIdx = 0;

      // Make connection lines between nodes that are close to each other
      for (let i = 0; i < nodesCount && lineIdx < linesCount; i++) {
        const x1 = posAttr.getX(i);
        const y1 = posAttr.getY(i);
        const z1 = posAttr.getZ(i);

        for (let j = i + 1; j < nodesCount && lineIdx < linesCount; j++) {
          const x2 = posAttr.getX(j);
          const y2 = posAttr.getY(j);
          const z2 = posAttr.getZ(j);

          const distSq = (x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2;
          if (distSq < 0.6) {
            linePosAttr.setXYZ(lineIdx * 2, x1, y1, z1);
            linePosAttr.setXYZ(lineIdx * 2 + 1, x2, y2, z2);
            lineIdx++;
          }
        }
      }
      // Fill remaining line buffers with zero or last point to prevent issues
      while (lineIdx < linesCount) {
        linePosAttr.setXYZ(lineIdx * 2, 0, 0, 0);
        linePosAttr.setXYZ(lineIdx * 2 + 1, 0, 0, 0);
        lineIdx++;
      }
      linePosAttr.needsUpdate = true;
    };

    updateConnections();

    // --- Parallax / Interaction ---
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mouseRef.current.targetX = x * 0.4;
      mouseRef.current.targetY = y * 0.4;
    };

    container.addEventListener('mousemove', handleMouseMove);

    // --- Animation Loop ---
    let animationFrameId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      // Slow, majestic rotations
      mainGroup.rotation.y = elapsed * 0.08;
      mainGroup.rotation.x = elapsed * 0.04;

      // Opposite rotation for rings
      orbitalRing1.rotation.y = -elapsed * 0.15;
      orbitalRing2.rotation.z = elapsed * 0.22;

      // Nucleus Pulsing Scale & Glow Emissiveness
      const pulse = 1.0 + Math.sin(elapsed * 1.5) * 0.06;
      nucleus.scale.set(pulse, pulse, pulse);
      nucleusMat.opacity = 0.08 + Math.sin(elapsed * 1.5) * 0.03;

      // Synaptic Nodes Blinking
      const nodePosAttr = nodesGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < nodesCount; i++) {
        // Individual neuron blink
        const phase = nodePhases[i] + elapsed * nodeSpeeds[i];
        const offset = Math.sin(phase) * 0.012;
        
        // Slightly vibrate node
        nodePosAttr.setX(i, nodePosAttr.getX(i) + offset * Math.sin(elapsed));
        nodePosAttr.setY(i, nodePosAttr.getY(i) + offset * Math.cos(elapsed));
      }
      nodePosAttr.needsUpdate = true;
      nodesMat.opacity = 0.4 + Math.sin(elapsed * 0.8) * 0.2;

      // Core points animation
      const corePosAttr = coreGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < corePointsCount; i++) {
        const rand = coreRandomData[i];
        const scale = 1.0 + Math.sin(elapsed * 2.0 + rand * Math.PI) * 0.02;
        corePosAttr.setX(i, corePosAttr.getX(i) * scale);
        corePosAttr.setY(i, corePosAttr.getY(i) * scale);
        corePosAttr.setZ(i, corePosAttr.getZ(i) * scale);
      }
      corePosAttr.needsUpdate = true;

      // Update lines periodically or each frame (computationally cheap for 40 lines)
      updateConnections();

      // Mouse Parallax Lerp
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.06;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.06;

      mainGroup.position.x = mouseRef.current.x;
      mainGroup.position.y = mouseRef.current.y;

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();
    onReady();

    // --- Resize handler ---
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(animationFrameId);
      container.removeEventListener('mousemove', handleMouseMove);
      resizeObserver.disconnect();
      renderer.dispose();
      outerGeo.dispose();
      outerMat.dispose();
      nucleusGeo.dispose();
      nucleusMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      nodesGeo.dispose();
      nodesMat.dispose();
      ring1Geo.dispose();
      ring1Mat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      linesGeo.dispose();
      linesMat.dispose();
      crimsonGlow.dispose();
      cyanGlow.dispose();
    };
  }, [onReady]);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full bg-[#050202] overflow-hidden select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Atmospheric radial ambient glow */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(255,0,60,0.08)_0%,rgba(0,0,0,0)_70%)]" />

      {/* Corner Bracket decorations framing the core (holographic/tactical) */}
      <div className="absolute top-8 left-8 w-8 h-8 border-t border-l border-[#FF003C]/35 pointer-events-none" />
      <div className="absolute top-8 right-8 w-8 h-8 border-t border-r border-[#FF003C]/35 pointer-events-none" />
      <div className="absolute bottom-8 left-8 w-8 h-8 border-b border-l border-[#FF003C]/35 pointer-events-none" />
      <div className="absolute bottom-8 right-8 w-8 h-8 border-b border-r border-[#FF003C]/35 pointer-events-none" />

      {/* HUD overlay - left stats */}
      <div className="absolute top-10 left-10 flex flex-col gap-1.5 font-mono text-[9px] text-[#ff003c]/60 pointer-events-none tracking-widest">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-[#FF003C] animate-pulse rounded-full shadow-[0_0_8px_#FF003C]" />
          <span>NEURAL_CORE: ACTIVE</span>
        </div>
        <div>STABILITY: 98.2% (OPTIMIZED)</div>
        <div>SYNC_FREQ: 120.4 THz (STABLE)</div>
        <div>LOCKED_ON_TARGET: GENIUS_E_V4.2</div>
      </div>

      {/* HUD overlay - right coordinates (updating) */}
      <div className="absolute bottom-10 right-10 flex flex-col text-right font-mono text-[9px] text-[#00f0ff]/50 pointer-events-none tracking-widest">
        <div>SYS_LOC: CORE_GRID_0x8F</div>
        <div>BEAM_TILT: +14.28°</div>
        <div>SATELLITE_LINK: SYNCED</div>
        <div className="text-[#ff003c]/40 mt-1">LAT: 37.7749° N / LON: 122.4194° W</div>
      </div>
    </div>
  );
}
