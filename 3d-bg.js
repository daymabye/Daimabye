/* ================================================
   DAIMA BELLEZA — 3D Beauty Objects Background v4
   Three.js r128 (UMD global) — floating lipsticks & perfume
   bottles, scroll-reactive motion, subtle PBR gold reflections.
   ================================================ */

(function () {
  'use strict';

  const PALETTES = [
    { handle: 0x4a2f2a, gold: 0xd9b47a, goldDeep: 0xb5905c, glass: 0xb85c4a, lip: 0xb23a4e }, // rosewood
    { handle: 0x6b4c4c, gold: 0xc9a96e, goldDeep: 0xa1855c, glass: 0xa8425a, lip: 0xc2536a }, // mauve
    { handle: 0x35302c, gold: 0xe8cf9c, goldDeep: 0xc2a56e, glass: 0x8a5a34, lip: 0x8f3348 }, // espresso
  ];

  let scene, camera, renderer, clock;
  let props = [];
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
    buildPropsField();
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

  /* ---------- lipstick factory: gold case + glossy colored bullet ---------- */
  function createLipstick(palette) {
    const group = new THREE.Group();

    const goldMat = new THREE.MeshPhysicalMaterial({
      color: palette.gold, metalness: 1.0, roughness: 0.18, envMapIntensity: 1.35
    });

    const casePts = [
      [0.000, -1.60], [0.088, -1.58], [0.098, -1.52], [0.100, -1.45],
      [0.100, -0.65], [0.094, -0.60], [0.100, -0.55], [0.100, 0.00]
    ].map(p => new THREE.Vector2(p[0], p[1]));
    group.add(new THREE.Mesh(new THREE.LatheGeometry(casePts, 28), goldMat));

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.100, 0.010, 8, 28),
      new THREE.MeshStandardMaterial({ color: palette.goldDeep, metalness: 1, roughness: 0.32 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.00;
    group.add(rim);

    const bulletMat = new THREE.MeshPhysicalMaterial({
      color: palette.lip, metalness: 0.05, roughness: 0.22,
      clearcoat: 1.0, clearcoatRoughness: 0.08, envMapIntensity: 1.1
    });
    const bulletPts = [
      [0.060, 0.00], [0.070, 0.04], [0.072, 0.32], [0.062, 0.52],
      [0.032, 0.66], [0.000, 0.71]
    ].map(p => new THREE.Vector2(p[0], p[1]));
    group.add(new THREE.Mesh(new THREE.LatheGeometry(bulletPts, 28), bulletMat));

    group.scale.setScalar(1.45);
    return group;
  }

  /* ---------- perfume bottle factory: glass flacon + gold cap ---------- */
  function createPerfumeBottle(palette) {
    const group = new THREE.Group();

    const goldMat = new THREE.MeshPhysicalMaterial({
      color: palette.gold, metalness: 1.0, roughness: 0.18, envMapIntensity: 1.35
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: palette.glass, metalness: 0.0, roughness: 0.08, transparent: true, opacity: 0.85,
      clearcoat: 1.0, clearcoatRoughness: 0.05, envMapIntensity: 1.25
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.60, 0.20), glassMat);
    body.position.y = 0.30;
    group.add(body);

    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.19, 0.012, 8, 4),
      new THREE.MeshStandardMaterial({ color: palette.goldDeep, metalness: 1, roughness: 0.35 })
    );
    baseRing.rotation.x = Math.PI / 2;
    baseRing.rotation.z = Math.PI / 4;
    baseRing.position.y = 0.01;
    baseRing.scale.set(1, 1.06, 1);
    group.add(baseRing);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 20), goldMat);
    neck.position.y = 0.66;
    group.add(neck);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.10, 0.20, 20), goldMat);
    cap.position.y = 0.82;
    group.add(cap);

    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), goldMat);
    capTop.position.y = 0.92;
    group.add(capTop);

    group.scale.setScalar(3.0);
    return group;
  }

  /* ---------- scatter several beauty objects around the viewport ---------- */
  function buildPropsField() {
    const desktopLayout = [
      { x:  2.35, y:  0.30, z: -0.6,  scale: 1.10, rotZ: -0.42, spin: 1.0,  drift: 0.55, pal: 0, type: 'lipstick' },
      { x: -2.75, y: -1.35, z: -2.2,  scale: 0.62, rotZ:  2.35, spin: -0.7, drift: 0.35, pal: 1, type: 'bottle' },
      { x:  3.55, y: -2.05, z: -2.6,  scale: 0.5,  rotZ:  0.85, spin: 0.55, drift: -0.4, pal: 2, type: 'lipstick' },
      { x: -3.35, y:  1.85, z: -2.8,  scale: 0.48, rotZ: -1.6,  spin: -0.9, drift: 0.5,  pal: 2, type: 'bottle' },
      { x:  0.15, y:  2.55, z: -3.2,  scale: 0.4,  rotZ:  1.15, spin: 0.65, drift: -0.3, pal: 1, type: 'lipstick' },
      { x: -0.9,  y: -2.7,  z: -3.4,  scale: 0.42, rotZ: -2.1,  spin: -0.5, drift: 0.42, pal: 0, type: 'bottle' },
    ];
    const mobileLayout = [
      { x:  1.15, y:  0.35, z: -0.7, scale: 0.78, rotZ: -0.42, spin: 1.0,  drift: 0.5,  pal: 0, type: 'lipstick' },
      { x: -1.55, y: -1.9,  z: -2.3, scale: 0.42, rotZ:  1.9,  spin: -0.7, drift: 0.4,  pal: 1, type: 'bottle' },
      { x:  1.6,  y:  1.95, z: -2.4, scale: 0.4,  rotZ: -1.4,  spin: 0.6,  drift: -0.35,pal: 2, type: 'lipstick' },
    ];

    const layout = isMobile ? mobileLayout : desktopLayout;

    layout.forEach((cfg) => {
      const b = cfg.type === 'bottle'
        ? createPerfumeBottle(PALETTES[cfg.pal])
        : createLipstick(PALETTES[cfg.pal]);
      b.scale.multiplyScalar(cfg.scale);
      b.position.set(cfg.x, cfg.y, cfg.z);
      b.rotation.set(0.12, Math.random() * Math.PI * 2, cfg.rotZ);
      const far = cfg.z < -1.8;
      b.traverse(o => {
        if (o.material) {
          o.material = o.material.clone();
          o.material.transparent = far || !!o.material.transparent;
          o.material.opacity = far ? 0.55 : (o.material.opacity ?? 1);
        }
      });
      props.push({
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

    props.forEach((b) => {
      const g = b.group;
      // idle float
      g.position.y = b.baseY + Math.sin(t * 0.5 + b.phase) * 0.18
                      + (scrollT - 0.5) * b.drift * 2.4; // gentle scroll drift
      g.position.x = b.baseX + curX * 0.25 * (b.baseZ > -1.5 ? 1 : 0.4);
      // scroll spins the object like it's being twirled
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
