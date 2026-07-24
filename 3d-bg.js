/* ================================================
   DAIMA BELLEZA — 3D Makeup Brushes Background v3
   Three.js r128 (UMD global) — several floating brushes,
   scroll-reactive motion, subtle PBR gold reflections.
   ================================================ */

(function () {
  'use strict';

  const PALETTES = [
    { handle: 0x4a2f2a, gold: 0xd9b47a, goldDeep: 0xb5905c, dark: 0x8a5a50, mid: 0xd8ab97, tip: 0xf6e8da }, // rosewood
    { handle: 0x6b4c4c, gold: 0xc9a96e, goldDeep: 0xa1855c, dark: 0x9c6f66, mid: 0xe0bcae, tip: 0xf8ede2 }, // mauve
    { handle: 0x35302c, gold: 0xe8cf9c, goldDeep: 0xc2a56e, dark: 0x7d6560, mid: 0xcbaea0, tip: 0xf3e6da }, // espresso
  ];

  let scene, camera, renderer, clock;
  let brushes = [];
  let sparkA, sparkB;
  let W, H, isMobile;
  let mouseX = 0, mouseY = 0, curX = 0, curY = 0;
  let scrollY = 0, docRange = 1;
  let rafId = null;
  const reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init() {
    const canvas = document.getElementById('brush-canvas');
    if (!canvas || !window.WebGLRenderingContext) return;

    W = window.innerWidth;
    H = window.innerHeight;
    isMobile = W < 700;

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 60);
    camera.position.set(0, 0.15, 7);

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !isMobile });
    } catch (e) { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.85));
    renderer.setSize(W, H);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;

    clock = new THREE.Clock();

    buildEnvironment();
    buildLights();
    buildBrushField();
    buildSparkles();

    updateDocRange();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('load', updateDocRange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!isMobile) window.addEventListener('mousemove', onMouse, { passive: true });

    if (reducedMotion) {
      renderer.render(scene, camera);
    } else {
      animate();
    }
  }

  function buildEnvironment() {
    const cnv = document.createElement('canvas');
    cnv.width = 512; cnv.height = 256;
    const ctx = cnv.getContext('2d');

    const sky = ctx.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0.0, '#fff8f0');
    sky.addColorStop(0.45, '#f3ddd2');
    sky.addColorStop(0.75, '#dcb9a8');
    sky.addColorStop(1.0, '#8a6a5c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 512, 256);

    function softbox(x, y, rx, ry, color, alpha) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, ry / rx);
      ctx.translate(-x, -y);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    softbox(120, 60, 90, 55, '#ffffff', 0.95);
    softbox(390, 90, 70, 45, '#ffe9d6', 0.8);
    softbox(256, 200, 130, 40, '#e8b9a4', 0.5);

    const tex = new THREE.CanvasTexture(cnv);
    tex.mapping = THREE.EquirectangularReflectionMapping;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envRT = pmrem.fromEquirectangular(tex);
    scene.environment = envRT.texture;
    tex.dispose();
    pmrem.dispose();
  }

  function buildLights() {
    scene.add(new THREE.AmbientLight(0xfff2ea, 0.4));

    const key = new THREE.DirectionalLight(0xfff0e2, 1.1);
    key.position.set(3.5, 5, 4);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xffd9c8, 0.55);
    rim.position.set(-4, 1.5, -2);
    scene.add(rim);

    const glow = new THREE.PointLight(0xffe4d6, 0.6, 18);
    glow.position.set(1.5, -2.5, 3.5);
    scene.add(glow);
  }

  /* ---------- one reusable brush factory ---------- */
  function createBrush(palette, strandCount) {
    const group = new THREE.Group();

    const handlePts = [
      [0.000, -3.30], [0.055, -3.29], [0.095, -3.24], [0.125, -3.14],
      [0.145, -2.95], [0.150, -2.60], [0.138, -2.10], [0.120, -1.55],
      [0.112, -1.05], [0.116, -0.65], [0.128, -0.32], [0.138, -0.10],
      [0.140,  0.00]
    ].map(p => new THREE.Vector2(p[0], p[1]));

    const handleMat = new THREE.MeshPhysicalMaterial({
      color: palette.handle, metalness: 0.0, roughness: 0.32,
      clearcoat: 1.0, clearcoatRoughness: 0.12, envMapIntensity: 1.0
    });
    group.add(new THREE.Mesh(new THREE.LatheGeometry(handlePts, 32), handleMat));

    const goldMat = new THREE.MeshPhysicalMaterial({
      color: palette.gold, metalness: 1.0, roughness: 0.18, envMapIntensity: 1.35
    });
    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.014, 10, 32), goldMat);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = -3.02;
    group.add(baseRing);

    const ferrulePts = [
      [0.140, 0.00], [0.150, 0.06], [0.138, 0.10],
      [0.152, 0.16], [0.140, 0.20],
      [0.152, 0.30], [0.155, 0.55], [0.150, 0.78], [0.146, 0.86]
    ].map(p => new THREE.Vector2(p[0], p[1]));
    group.add(new THREE.Mesh(new THREE.LatheGeometry(ferrulePts, 32), goldMat));

    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(0.143, 0.008, 8, 32),
      new THREE.MeshStandardMaterial({ color: palette.goldDeep, metalness: 1, roughness: 0.35 })
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.86;
    group.add(lip);

    buildBristles(group, palette, strandCount);

    return group;
  }

  function buildBristles(group, palette, strandCount) {
    const R0 = 0.148, yBase = 0.85, domeH = 0.62, domeR = 0.19;

    const domePts = [new THREE.Vector2(R0 * 0.9, yBase)];
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const r = Math.cos(t * Math.PI / 2) * domeR + (1 - t) * (R0 * 0.9 - domeR) * 0.3;
      domePts.push(new THREE.Vector2(Math.max(r, 0.001) * Math.sin(Math.PI / 2 * (1 - t) + t * 1.2), yBase + t * domeH));
    }
    domePts.push(new THREE.Vector2(0, yBase + domeH + 0.02));
    const domeMat = new THREE.MeshStandardMaterial({ color: palette.mid, roughness: 0.95, metalness: 0 });
    group.add(new THREE.Mesh(new THREE.LatheGeometry(domePts, 24), domeMat));

    const strandGeo = new THREE.CylinderGeometry(0.0042, 0.0008, 1, 4, 4);
    strandGeo.translate(0, 0.5, 0);

    const pos = strandGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cDark = new THREE.Color(palette.dark);
    const cMid  = new THREE.Color(palette.mid);
    const cTip  = new THREE.Color(palette.tip);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i);
      if (t < 0.5) tmp.copy(cDark).lerp(cMid, t / 0.5);
      else tmp.copy(cMid).lerp(cTip, (t - 0.5) / 0.5);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    strandGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const strandMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0.0, envMapIntensity: 0.45
    });

    const strands = new THREE.InstancedMesh(strandGeo, strandMat, strandCount);
    const dummy = new THREE.Object3D();
    const axis = new THREE.Vector3();
    const q = new THREE.Quaternion();

    for (let i = 0; i < strandCount; i++) {
      const rr = Math.sqrt(Math.random());
      const r = rr * R0 * 0.96;
      const th = Math.random() * Math.PI * 2;

      dummy.position.set(Math.cos(th) * r, yBase + 0.01, Math.sin(th) * r);

      const flare = rr * rr * 0.42 + (Math.random() - 0.5) * 0.07;
      axis.set(Math.sin(th), 0, -Math.cos(th));
      q.setFromAxisAngle(axis, flare);
      dummy.quaternion.copy(q);

      const L = (0.92 - 0.38 * rr * rr) * (0.88 + Math.random() * 0.22);
      dummy.scale.set(1, L, 1);

      dummy.updateMatrix();
      strands.setMatrixAt(i, dummy.matrix);
    }
    group.add(strands);
  }

  /* ---------- scatter several brushes around the viewport ---------- */
  function buildBrushField() {
    const desktopLayout = [
      { x:  2.35, y:  0.30, z: -0.6,  scale: 1.10, rotZ: -0.42, spin: 1.0,  drift: 0.55, pal: 0 },
      { x: -2.75, y: -1.35, z: -2.2,  scale: 0.62, rotZ:  2.35, spin: -0.7, drift: 0.35, pal: 1 },
      { x:  3.55, y: -2.05, z: -2.6,  scale: 0.5,  rotZ:  0.85, spin: 0.55, drift: -0.4, pal: 2 },
      { x: -3.35, y:  1.85, z: -2.8,  scale: 0.48, rotZ: -1.6,  spin: -0.9, drift: 0.5,  pal: 2 },
      { x:  0.15, y:  2.55, z: -3.2,  scale: 0.4,  rotZ:  1.15, spin: 0.65, drift: -0.3, pal: 1 },
      { x: -0.9,  y: -2.7,  z: -3.4,  scale: 0.42, rotZ: -2.1,  spin: -0.5, drift: 0.42, pal: 0 },
    ];
    const mobileLayout = [
      { x:  1.15, y:  0.35, z: -0.7, scale: 0.78, rotZ: -0.42, spin: 1.0,  drift: 0.5,  pal: 0 },
      { x: -1.55, y: -1.9,  z: -2.3, scale: 0.42, rotZ:  1.9,  spin: -0.7, drift: 0.4,  pal: 1 },
      { x:  1.6,  y:  1.95, z: -2.4, scale: 0.4,  rotZ: -1.4,  spin: 0.6,  drift: -0.35,pal: 2 },
    ];

    const layout = isMobile ? mobileLayout : desktopLayout;
    const strandCount = isMobile ? 140 : 220;

    layout.forEach((cfg) => {
      const b = createBrush(PALETTES[cfg.pal], strandCount);
      b.scale.setScalar(cfg.scale);
      b.position.set(cfg.x, cfg.y, cfg.z);
      b.rotation.set(0.12, Math.random() * Math.PI * 2, cfg.rotZ);
      const far = cfg.z < -1.8;
      b.traverse(o => {
        if (o.material) {
          o.material = o.material.clone();
          o.material.transparent = far;
          o.material.opacity = far ? 0.55 : 1;
        }
      });
      brushes.push({
        group: b,
        baseX: cfg.x, baseY: cfg.y, baseZ: cfg.z,
        baseRotY: b.rotation.y, baseRotZ: cfg.rotZ,
        spin: cfg.spin, drift: cfg.drift,
        phase: Math.random() * Math.PI * 2
      });
      scene.add(b);
    });
  }

  function makeSparkTexture() {
    const cnv = document.createElement('canvas');
    cnv.width = cnv.height = 64;
    const ctx = cnv.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,244,224,1)');
    g.addColorStop(0.25, 'rgba(255,220,170,0.85)');
    g.addColorStop(0.6, 'rgba(230,180,120,0.25)');
    g.addColorStop(1, 'rgba(230,180,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cnv);
  }

  function buildSparkles() {
    const tex = makeSparkTexture();
    const mk = (count, size, opacity, spread) => {
      const geo = new THREE.BufferGeometry();
      const p = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        p[i * 3]     = (Math.random() - 0.5) * spread;
        p[i * 3 + 1] = (Math.random() - 0.5) * (spread * 0.7);
        p[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1.5;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const mat = new THREE.PointsMaterial({
        map: tex, color: 0xf0c890, size, transparent: true,
        opacity, depthWrite: false, blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      });
      const pts = new THREE.Points(geo, mat);
      scene.add(pts);
      return pts;
    };
    const n = isMobile ? 0.5 : 1;
    sparkA = mk(Math.round(70 * n), 0.10, 0.5, 16);
    sparkB = mk(Math.round(40 * n), 0.05, 0.7, 13);
  }

  function updateDocRange() {
    docRange = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
  }

  function onScroll() {
    scrollY = window.scrollY || window.pageYOffset || 0;
  }

  function animate() {
    rafId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    const scrollT = scrollY / docRange; // 0..1

    curX += (mouseX - curX) * 0.03;
    curY += (mouseY - curY) * 0.03;
    camera.position.x = curX * 0.18;
    camera.position.y = 0.15 - curY * 0.12;
    camera.lookAt(0.3, 0, 0);

    brushes.forEach((b) => {
      const g = b.group;
      // idle float
      g.position.y = b.baseY + Math.sin(t * 0.5 + b.phase) * 0.18
                      + (scrollT - 0.5) * b.drift * 2.4; // gentle scroll drift
      g.position.x = b.baseX + curX * 0.25 * (b.baseZ > -1.5 ? 1 : 0.4);
      // scroll spins the brush like a whisked wand
      g.rotation.y = b.baseRotY + t * 0.15 * Math.sign(b.spin) + scrollT * Math.PI * 2 * b.spin;
      g.rotation.z = b.baseRotZ + Math.sin(t * 0.3 + b.phase) * 0.07;
    });

    if (sparkA) { sparkA.rotation.y = t * 0.03 + scrollT * 0.6; sparkA.rotation.z = t * 0.008; }
    if (sparkB) { sparkB.rotation.y = -t * 0.045 - scrollT * 0.4; }

    renderer.render(scene, camera);
  }

  function onResize() {
    W = window.innerWidth;
    H = window.innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
    updateDocRange();
  }

  function onMouse(e) {
    mouseX = (e.clientX / W - 0.5) * 2;
    mouseY = (e.clientY / H - 0.5) * 2;
  }

  // Backgrounded tab: stop the render loop (saves battery/CPU); resume on return.
  function onVisibilityChange() {
    if (document.hidden) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    } else if (rafId === null && !reducedMotion) {
      animate();
    }
  }

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
