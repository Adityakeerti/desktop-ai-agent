import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface GlobeStatus {
  onReady: () => void;
}

export default function GlobeCanvas({ onReady }: GlobeStatus) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth  || 500;
    const h = container.clientHeight || 450;

    const scene    = new THREE.Scene();
    const camera   = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);

    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%';
    container.appendChild(canvas);

    /* Wireframe globe */
    const geo  = new THREE.IcosahedronGeometry(1.6, 4);
    const mat  = new THREE.MeshPhongMaterial({
      color: 0xFF003C, wireframe: true, transparent: true, opacity: 0.65,
      emissive: new THREE.Color(0xFF003C), emissiveIntensity: 0.25,
    });
    const globe = new THREE.Mesh(geo, mat);
    scene.add(globe);

    /* Inner glow sphere */
    const innerGeo = new THREE.SphereGeometry(1.0, 32, 32);
    const innerMat = new THREE.MeshPhongMaterial({
      color: 0x00F0FF, transparent: true, opacity: 0.20,
      emissive: new THREE.Color(0x00F0FF), emissiveIntensity: 0.15,
    });
    const innerSphere = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerSphere);

    /* Lights */
    const pt = new THREE.PointLight(0xFFFFFF, 1, 100); pt.position.set(8, 8, 8); scene.add(pt);
    const red = new THREE.PointLight(0xFF003C, 0.6, 50); red.position.set(-5, -5, 4); scene.add(red);
    scene.add(new THREE.AmbientLight(0x1a0505, 1.5));

    camera.position.z = 5;

    let rafId: number;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const t = Date.now() * 0.001;
      globe.rotation.y += 0.006;
      globe.rotation.x += 0.003;
      innerSphere.scale.setScalar(1 + Math.sin(t * 2) * 0.07);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const nw = container.clientWidth, nh = container.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    setTimeout(onReady, 1800);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      container.removeChild(canvas);
      renderer.dispose();
    };
  }, [onReady]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
