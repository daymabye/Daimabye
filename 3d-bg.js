/* ================================================
   DAIMA BELLEZA — 3D Makeup Brush Background
   Three.js r158 (importmap CDN)
   ================================================ */

(function () {
  'use strict';

  // --- CONFIG ---
  const ROSE_GOLD   = 0xd4a0a0;
  const GOLD        = 0xc9a96e;
  const CREAM       = 0xf5ede8;
  const DARK_HANDLE = 0x6b4c4c;
  const BRISTLE_TIP = 0xe8c4b8;
  const BG_COLOR    = 0xf9f1ef;

  let scene, camera, renderer, brushGroup;
  let particles, clock;
  let W, H;
  let mouseX = 0, mouseY = 0;
  let canvas;

  function init() {
    canvas = document.getElementById('brush-canvas');
    if (!canvas) return;

    W = window.innerWidth;
    H = window.innerHeight;

    // Scene
    scene = new THREE.Scene();
    scene.background = null; // transparent over CSS bg

    // Camera
    camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0, 7);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;

    clock = new THREE.Clock();

    // Lights
    buildLights();

    // Build Brush
    brushGroup = new THREE.Group();
    scene.add(brushGroup);
    buildBrush();

    // Floating particles (glitter)
    buildParticles();

    // Events
    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouse);

    animate();
  }

  function buildLights() {
    const ambient = new THREE.AmbientLight(0xfff0f0, 0.6);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffd6cc, 1.4);
    key.position.set(3, 5, 5);
    key.castShadow = true;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffb6c1, 0.5);
    fill.position.set(-4, 2, 2);
    scene.add(fill);

    const rim = new THREE.PointLight(0xffe4e1, 1.2, 20);
    rim.position.set(2, -3, 4);
    scene.add(rim);
  }

  function buildBrush() {
    // ---- HANDLE ----
    const handleMat = new THREE.MeshStandardMaterial({
      color: DARK_HANDLE,
      metalness: 0.3,
      roughness: 0.6,
    });

    // Main handle cylinder (tapered)
    const handleGeo = new THREE.CylinderGeometry(0.12, 0.18, 3.2, 32, 1);
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.y = -1.6;
    brushGroup.add(handle);

    // Gold ferrule (ring between handle and bristles)
    const ferruleMat = new THREE.MeshStandardMaterial({
      color: GOLD,
      metalness: 0.85,
      roughness: 0.15,
    });
    const ferruleGeo = new THREE.CylinderGeometry(0.175, 0.18, 0.28, 32);
    const ferrule = new THREE.Mesh(ferruleGeo, ferruleMat);
    ferrule.position.y = 0.12;
    brushGroup.add(ferrule);

    // Second decorative ring
    const ring2Geo = new THREE.TorusGeometry(0.175, 0.025, 12, 32);
    const ring2 = new THREE.Mesh(ring2Geo, ferruleMat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.3;
    brushGroup.add(ring2);

    // ---- BRISTLES ----
    // Base (flat cylinder)
    const bristleBaseMat = new THREE.MeshStandardMaterial({
      color: ROSE_GOLD,
      metalness: 0.1,
      roughness: 0.8,
    });
    const bristleBaseGeo = new THREE.CylinderGeometry(0.17, 0.175, 0.15, 32);
    const bristleBase = new THREE.Mesh(bristleBaseGeo, bristleBaseMat);
    bristleBase.position.y = 0.33;
    brushGroup.add(bristleBase);

    // Bristle body — soft rounded dome
    const bristleBodyMat = new THREE.MeshStandardMaterial({
      color: BRISTLE_TIP,
      metalness: 0.0,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });

    // Dome shape using SphereGeometry (half)
    const domeGeo = new THREE.SphereGeometry(0.32, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, bristleBodyMat);
    dome.position.y = 0.42;
    brushGroup.add(dome);

    // Bristle tip cone (tapered softly)
    const tipGeo = new THREE.ConeGeometry(0.32, 0.65, 32, 8);
    const tipMat = new THREE.MeshStandardMaterial({
      color: CREAM,
      metalness: 0.0,
      roughness: 0.9,
    });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.y = 0.42 + 0.32;
    brushGroup.add(tip);

    // Individual bristle strands (thin cylinders for realism)
    const strandMat = new THREE.MeshStandardMaterial({ color: 0xe0c8c0, roughness: 1 });
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2;
      const r = 0.1 + Math.random() * 0.14;
      const strandGeo = new THREE.CylinderGeometry(0.003, 0.001, 0.55 + Math.random() * 0.2, 4);
      const strand = new THREE.Mesh(strandGeo, strandMat);
      strand.position.set(
        Math.cos(angle) * r,
        0.85 + Math.random() * 0.1,
        Math.sin(angle) * r
      );
      strand.rotation.x = (Math.random() - 0.5) * 0.15;
      strand.rotation.z = (Math.random() - 0.5) * 0.15;
      brushGroup.add(strand);
    }

    // ---- HANDLE END CAP ----
    const capGeo = new THREE.SphereGeometry(0.12, 16, 8);
    const cap = new THREE.Mesh(capGeo, ferruleMat);
    cap.position.y = -3.25;
    brushGroup.add(cap);

    // Position entire brush
    brushGroup.rotation.z = -0.35;
    brushGroup.rotation.x = 0.1;
    brushGroup.position.set(2.2, 0.2, -1);
  }

  function buildParticles() {
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 2;
      sizes[i] = Math.random() * 3 + 1;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      color: GOLD,
      size: 0.04,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
    });

    particles = new THREE.Points(geo, mat);
    scene.add(particles);
  }

  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // Smooth floating rotation
    brushGroup.rotation.y = Math.sin(t * 0.4) * 0.35;
    brushGroup.position.y = 0.2 + Math.sin(t * 0.6) * 0.18;
    brushGroup.rotation.z = -0.35 + Math.sin(t * 0.3) * 0.08;

    // Subtle mouse parallax
    brushGroup.position.x = 2.2 + mouseX * 0.4;
    camera.position.x += (mouseX * 0.2 - camera.position.x) * 0.02;
    camera.position.y += (-mouseY * 0.15 - camera.position.y) * 0.02;
    camera.lookAt(scene.position);

    // Glitter drift
    if (particles) {
      particles.rotation.y = t * 0.04;
      particles.rotation.x = t * 0.02;
    }

    renderer.render(scene, camera);
  }

  function onResize() {
    W = window.innerWidth;
    H = window.innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  }

  function onMouse(e) {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  }

  // Boot after Three.js loads
  function boot() {
    if (typeof THREE === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload = init;
      document.head.appendChild(s);
    } else {
      init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
