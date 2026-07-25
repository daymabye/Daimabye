/* ================================================
   DAIMA BELLEZA — 3D Beauty Props Background v5
   Three.js r128 (UMD global) — floating brushes, lipsticks,
   perfume flacons and powder compacts. Scroll-reactive motion,
   warm PBR gold with a high-contrast studio so the metal reads.
   ================================================ */

(function () {
  'use strict';

  /* Deeper metals than a literal "champagne gold": against the cream page a pale
     gold rendered as a near-white smudge. These read as jewellery, not haze. */
  const PALETTES = [
    { handle: 0x4a2f2a, gold: 0xc08a4a, goldDeep: 0x8f6330, glass: 0x8e2438, lip: 0xa32138,
      powder: 0x9e3d4d, dark: 0x8a5a50, mid: 0xd8ab97, tip: 0xf6e8da }, // rosewood
    { handle: 0x6b4c4c, gold: 0xb8874e, goldDeep: 0x8a6135, glass: 0x7d2848, lip: 0xb8365c,
      powder: 0xa33f57, dark: 0x9c6f66, mid: 0xe0bcae, tip: 0xf8ede2 }, // mauve
    { handle: 0x35302c, gold: 0xce9a57, goldDeep: 0x9c7038, glass: 0x633619, lip: 0x7d2438,
      powder: 0x82402a, dark: 0x7d6560, mid: 0xcbaea0, tip: 0xf3e6da }, // espresso
  ];

  let scene, camera, renderer, clock;
  let props = [];
  let sparkA, sparkB;
  let W, H, isMobile;
  let mouseX = 0, mouseY = 0, curX = 0, curY = 0;
  let scrollY = 0, docRange = 1;
  let scrollSmooth = 0, lastScrollT = 0, scrollKick = 0;
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
    scrollY = window.scrollY || window.pageYOffset || 0;
    scrollSmooth = lastScrollT = scrollY / docRange;

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

    /* A metal is essentially a mirror: it takes its look from what it reflects.
       A near-white studio made every gold part reflect cream and read as a pale
       beige smudge on a cream page. Keeping the top bright but dropping the
       lower hemisphere to near-black gives each object a dark underside and a
       bright crown — that gradient is what makes it read as polished metal. */
    const sky = ctx.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0.0, '#fffaf4');
    sky.addColorStop(0.30, '#f0d7c8');
    sky.addColorStop(0.58, '#a87f6a');
    sky.addColorStop(0.80, '#54382e');
    sky.addColorStop(1.0, '#241a16');
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
    softbox(120, 52, 95, 58, '#ffffff', 0.98);
    softbox(390, 84, 74, 48, '#ffe9d6', 0.85);
    softbox(256, 190, 130, 40, '#e8b9a4', 0.45);

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
    scene.add(new THREE.AmbientLight(0xfff2ea, 0.38));

    const key = new THREE.DirectionalLight(0xfff0e2, 1.15);
    key.position.set(3.5, 5, 4);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xffd9c8, 0.6);
    rim.position.set(-4, 1.5, -2);
    scene.add(rim);

    const glow = new THREE.PointLight(0xffe4d6, 0.55, 18);
    glow.position.set(1.5, -2.5, 3.5);
    scene.add(glow);
  }

  function goldMaterial(palette) {
    return new THREE.MeshPhysicalMaterial({
      color: palette.gold, metalness: 1.0, roughness: 0.18, envMapIntensity: 1.35
    });
  }

  /* ---------- makeup brush: lacquered handle, gold ferrule, real bristles ---------- */
  function createBrush(palette, strandCount) {
    const group = new THREE.Group();

    const handlePts = [
      [0.000, -3.30], [0.055, -3.29], [0.095, -3.24], [0.125, -3.14],
      [0.145, -2.95], [0.150, -2.60], [0.138, -2.10], [0.120, -1.55],
      [0.112, -1.05], [0.116, -0.65], [0.128, -0.32], [0.138, -0.10],
      [0.140,  0.00]
    ].map(p => new THREE.Vector2(p[0], p[1]));

    const handleMat = new THREE.MeshPhysicalMaterial({
      color: palette.handle, metalness: 0.0, roughness: 0.3,
      clearcoat: 1.0, clearcoatRoughness: 0.1, envMapIntensity: 0.9
    });
    group.add(new THREE.Mesh(new THREE.LatheGeometry(handlePts, 40), handleMat));

    const goldMat = goldMaterial(palette);
    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.014, 12, 40), goldMat);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = -3.02;
    group.add(baseRing);

    const ferrulePts = [
      [0.140, 0.00], [0.150, 0.06], [0.138, 0.10],
      [0.152, 0.16], [0.140, 0.20],
      [0.152, 0.30], [0.155, 0.55], [0.150, 0.78], [0.146, 0.86]
    ].map(p => new THREE.Vector2(p[0], p[1]));
    group.add(new THREE.Mesh(new THREE.LatheGeometry(ferrulePts, 40), goldMat));

    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(0.143, 0.008, 10, 40),
      new THREE.MeshStandardMaterial({ color: palette.goldDeep, metalness: 1, roughness: 0.33 })
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
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const r = Math.cos(t * Math.PI / 2) * domeR + (1 - t) * (R0 * 0.9 - domeR) * 0.3;
      domePts.push(new THREE.Vector2(
        Math.max(r, 0.001) * Math.sin(Math.PI / 2 * (1 - t) + t * 1.2),
        yBase + t * domeH
      ));
    }
    domePts.push(new THREE.Vector2(0, yBase + domeH + 0.02));
    const domeMat = new THREE.MeshStandardMaterial({
      color: palette.mid, roughness: 0.95, metalness: 0, envMapIntensity: 0.5
    });
    group.add(new THREE.Mesh(new THREE.LatheGeometry(domePts, 28), domeMat));

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

  /* ---------- lipstick: gold case + glossy bullet with a chiselled slant ---------- */
  function createLipstick(palette) {
    const group = new THREE.Group();
    const goldMat = goldMaterial(palette);

    const casePts = [
      [0.000, -1.60], [0.070, -1.595], [0.090, -1.575], [0.099, -1.535],
      [0.100, -1.45], [0.100, -0.66], [0.093, -0.60], [0.100, -0.54],
      [0.100, -0.04], [0.099, 0.00]
    ].map(p => new THREE.Vector2(p[0], p[1]));
    group.add(new THREE.Mesh(new THREE.LatheGeometry(casePts, 44), goldMat));

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.100, 0.009, 10, 44),
      new THREE.MeshStandardMaterial({ color: palette.goldDeep, metalness: 1, roughness: 0.3 })
    );
    rim.rotation.x = Math.PI / 2;
    group.add(rim);

    const bulletMat = new THREE.MeshPhysicalMaterial({
      color: palette.lip, metalness: 0.05, roughness: 0.28,
      // Dialled back from a bright default: the studio was blowing a deep berry
      // out into pastel pink through the clearcoat.
      clearcoat: 0.85, clearcoatRoughness: 0.12, envMapIntensity: 0.55
    });
    const bulletPts = [
      [0.062, 0.00], [0.072, 0.05], [0.073, 0.30], [0.068, 0.46],
      [0.056, 0.58], [0.036, 0.67], [0.014, 0.715], [0.000, 0.72]
    ].map(p => new THREE.Vector2(p[0], p[1]));
    const bullet = new THREE.Mesh(new THREE.LatheGeometry(bulletPts, 44), bulletMat);
    // Real lipsticks wear down to an angled face — a straight cone reads as a crayon.
    bullet.rotation.z = 0.13;
    bullet.position.y = 0.01;
    group.add(bullet);

    group.scale.setScalar(1.45);
    return group;
  }

  /* ---------- perfume flacon: turned glass body, gold collar and cap ---------- */
  function createPerfumeBottle(palette) {
    const group = new THREE.Group();

    const goldMat = goldMaterial(palette);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: palette.glass, metalness: 0.0, roughness: 0.06, transparent: true, opacity: 0.92,
      // High env intensity flooded the tinted glass with cream studio light until
      // the bottles read as blank boxes.
      clearcoat: 1.0, clearcoatRoughness: 0.04, envMapIntensity: 0.6
    });

    /* Lathed flacon instead of the old hard-edged box: a turned silhouette with
       shoulders and a waist reads as perfume from any angle, a cuboid doesn't. */
    const bodyPts = [
      [0.000, 0.00], [0.150, 0.005], [0.245, 0.045], [0.290, 0.135],
      [0.300, 0.260], [0.293, 0.390], [0.263, 0.487], [0.205, 0.553],
      [0.140, 0.590], [0.093, 0.607]
    ].map(p => new THREE.Vector2(p[0], p[1]));
    group.add(new THREE.Mesh(new THREE.LatheGeometry(bodyPts, 48), glassMat));

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.096, 0.075, 36), goldMat);
    collar.position.y = 0.645;
    group.add(collar);

    const collarRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.093, 0.010, 10, 36),
      new THREE.MeshStandardMaterial({ color: palette.goldDeep, metalness: 1, roughness: 0.3 })
    );
    collarRing.rotation.x = Math.PI / 2;
    collarRing.position.y = 0.683;
    group.add(collarRing);

    const capPts = [
      [0.000, 0.700], [0.085, 0.702], [0.105, 0.730], [0.110, 0.800],
      [0.104, 0.880], [0.080, 0.930], [0.040, 0.955], [0.000, 0.960]
    ].map(p => new THREE.Vector2(p[0], p[1]));
    group.add(new THREE.Mesh(new THREE.LatheGeometry(capPts, 40), goldMat));

    group.scale.setScalar(2.5);
    return group;
  }

  /* ---------- powder compact: open clamshell, pressed pan and mirror ---------- */
  function createCompact(palette) {
    const group = new THREE.Group();
    /* The case is built around the Y axis, so head-on it would show only its
       edge — a featureless disc. A POSITIVE X tilt swings the pan's +Y face
       toward the camera at +Z; tilting negative showed the blank underside of
       the case instead. The outer group stays free for scatter/scroll rotation. */
    const tilt = new THREE.Group();
    tilt.rotation.set(1.05, 0, 0.35);
    group.add(tilt);

    const goldMat = goldMaterial(palette);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.445, 0.105, 48), goldMat);
    tilt.add(base);

    const rimRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.455, 0.012, 10, 48),
      new THREE.MeshStandardMaterial({ color: palette.goldDeep, metalness: 1, roughness: 0.3 })
    );
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.y = 0.05;
    tilt.add(rimRing);

    const powder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.385, 0.385, 0.075, 48),
      // Low env influence: a matte pressed powder shouldn't pick up the studio
      // and fade to cream the way it did at full intensity.
      new THREE.MeshStandardMaterial({
        color: palette.powder, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.4
      })
    );
    powder.position.y = 0.03;
    tilt.add(powder);

    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.058, 48), goldMat);
    lid.position.set(0, 0.46, -0.40);
    lid.rotation.x = -1.25;
    tilt.add(lid);

    const mirror = new THREE.Mesh(
      new THREE.CylinderGeometry(0.385, 0.385, 0.014, 48),
      new THREE.MeshPhysicalMaterial({
        color: 0xdfe8ec, metalness: 0.95, roughness: 0.04, envMapIntensity: 1.7
      })
    );
    mirror.position.set(0, 0.437, -0.365);
    mirror.rotation.x = -1.25;
    tilt.add(mirror);

    group.scale.setScalar(1.6);
    return group;
  }

  /* ---------- scatter the props around the viewport ---------- */
  function buildPropsField() {
    const desktopLayout = [
      { x:  2.45, y:  0.30, z: -0.6,  scale: 1.05, rotZ: -0.42, spin: 1.0,  drift: 0.55, pal: 0, type: 'brush' },
      { x: -2.75, y: -1.30, z: -2.1,  scale: 0.70, rotZ:  2.35, spin: -0.7, drift: 0.35, pal: 1, type: 'bottle' },
      { x:  3.60, y: -2.10, z: -2.6,  scale: 0.55, rotZ:  0.85, spin: 0.55, drift: -0.4, pal: 2, type: 'compact' },
      { x: -3.40, y:  1.85, z: -2.8,  scale: 0.52, rotZ: -1.6,  spin: -0.9, drift: 0.5,  pal: 2, type: 'brush' },
      { x:  0.20, y:  2.55, z: -3.1,  scale: 0.46, rotZ:  1.15, spin: 0.65, drift: -0.3, pal: 1, type: 'lipstick' },
      { x: -0.95, y: -2.70, z: -3.3,  scale: 0.48, rotZ: -2.1,  spin: -0.5, drift: 0.42, pal: 0, type: 'compact' },
      { x:  1.35, y:  1.95, z: -4.0,  scale: 0.40, rotZ:  0.55, spin: 0.8,  drift: -0.35,pal: 0, type: 'lipstick' },
    ];
    const mobileLayout = [
      { x:  1.20, y:  0.35, z: -0.7, scale: 0.72, rotZ: -0.42, spin: 1.0,  drift: 0.5,  pal: 0, type: 'brush' },
      { x: -1.55, y: -1.95, z: -2.3, scale: 0.48, rotZ:  1.9,  spin: -0.7, drift: 0.4,  pal: 1, type: 'compact' },
      { x:  1.65, y:  2.00, z: -2.4, scale: 0.45, rotZ: -1.4,  spin: 0.6,  drift: -0.35,pal: 2, type: 'bottle' },
      { x: -1.30, y:  1.25, z: -3.4, scale: 0.34, rotZ:  0.9,  spin: -0.55,drift: 0.3,  pal: 0, type: 'lipstick' },
    ];

    const layout = isMobile ? mobileLayout : desktopLayout;
    const strandCount = isMobile ? 140 : 220;

    const FACTORY = {
      brush: (p) => createBrush(p, strandCount),
      bottle: createPerfumeBottle,
      compact: createCompact,
      lipstick: createLipstick,
    };

    layout.forEach((cfg) => {
      const b = (FACTORY[cfg.type] || createLipstick)(PALETTES[cfg.pal]);
      b.scale.multiplyScalar(cfg.scale);
      b.position.set(cfg.x, cfg.y, cfg.z);
      b.rotation.set(0.12, Math.random() * Math.PI * 2, cfg.rotZ);
      const far = cfg.z < -1.8;
      b.traverse(o => {
        if (o.material) {
          o.material = o.material.clone();
          o.material.transparent = far || !!o.material.transparent;
          o.material.opacity = far ? 0.72 : (o.material.opacity ?? 1);
        }
      });
      props.push({
        group: b,
        baseX: cfg.x, baseY: cfg.y, baseZ: cfg.z,
        baseRotX: 0.12, baseRotY: b.rotation.y, baseRotZ: cfg.rotZ,
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

    /* Scroll drives the scene twice over: `scrollSmooth` is the eased position
       (a steady drift down the page) and `scrollKick` is how HARD you are
       scrolling right now, which briefly spins the props so the background
       visibly reacts to the gesture instead of only to the offset. */
    const targetScrollT = scrollY / docRange;
    const delta = targetScrollT - lastScrollT;
    lastScrollT = targetScrollT;
    scrollSmooth += (targetScrollT - scrollSmooth) * 0.09;
    scrollKick += (delta * 26 - scrollKick) * 0.12;

    curX += (mouseX - curX) * 0.03;
    curY += (mouseY - curY) * 0.03;
    camera.position.x = curX * 0.18;
    camera.position.y = 0.15 - curY * 0.12;
    camera.lookAt(0.3, 0, 0);

    props.forEach((b) => {
      const g = b.group;
      // idle float + steady drift as the page scrolls
      g.position.y = b.baseY + Math.sin(t * 0.5 + b.phase) * 0.18
                      + (scrollSmooth - 0.5) * b.drift * 2.6;
      g.position.x = b.baseX + curX * 0.25 * (b.baseZ > -1.5 ? 1 : 0.4);
      // full turn across the page, plus an extra nudge while actively scrolling
      g.rotation.y = b.baseRotY + t * 0.15 * Math.sign(b.spin)
                      + scrollSmooth * Math.PI * 2 * b.spin
                      + scrollKick * b.spin * 1.6;
      g.rotation.z = b.baseRotZ + Math.sin(t * 0.3 + b.phase) * 0.07
                      + scrollKick * 0.35;
      g.rotation.x = b.baseRotX + scrollKick * 0.22;
    });

    if (sparkA) { sparkA.rotation.y = t * 0.03 + scrollSmooth * 0.6; sparkA.rotation.z = t * 0.008; }
    if (sparkB) { sparkB.rotation.y = -t * 0.045 - scrollSmooth * 0.4; }

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
