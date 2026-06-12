/* ============================================================
   EXHIBIT PX-01 — experience.js
   Single fixed WebGL stage driven by scroll:
   · scroll-scrubbed camera flight through an exploded LCD stack
   · procedural particle system that morphs into LC molecules
   · ambient dust field + HUD state shared via window.PX
   (Three.js r128, global build)
   ============================================================ */

"use strict";

window.PX = {
  flightStage: 0, flightP: 0,
  molPhase: 0, molT: 1, molField: false,
  cam: { x: 0, y: 0, z: 0 },
  webgl: true
};

(function experience() {
  const mount = document.getElementById("gl");
  if (!mount || typeof THREE === "undefined") { window.PX.webgl = false; return; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) { window.PX.webgl = false; return; }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  if (THREE.ACESFilmicToneMapping) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
  }
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060a, 0.0105);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 4, 30);

  /* ---------------- lights ---------------- */
  scene.add(new THREE.AmbientLight(0x90a8d0, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(14, 22, 12);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x4d6bff, 0.55);
  rim.position.set(-18, -6, -14);
  scene.add(rim);

  /* ---------------- helpers ---------------- */
  const _v = new THREE.Vector3();
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  function softTexture(rgb) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(0.4, `rgba(${rgb},0.45)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const whiteSoft = softTexture("235,245,255");

  function stripeTexture(horizontal) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d");
    x.fillStyle = "#1a2138";
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = "#5a6bb0";
    x.lineWidth = 2.5;
    for (let i = 6; i < 128; i += 11) {
      x.beginPath();
      if (horizontal) { x.moveTo(0, i); x.lineTo(128, i); }
      else { x.moveTo(i, 0); x.lineTo(i, 128); }
      x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    return t;
  }

  function pixelShapeTexture() {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 576;
    const x = c.getContext("2d");
    x.clearRect(0, 0, c.width, c.height);

    const cols = 72, rows = 40;
    const cw = c.width / cols, ch = c.height / rows;
    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        const px = ix * cw + 1.4;
        const py = iy * ch + 1.4;
        const w = cw - 2.8;
        const h = ch - 2.8;
        const wave = Math.sin(ix * 0.7 + iy * 0.45);
        const isWarm = (ix + iy * 2) % 11 === 0;
        x.fillStyle = isWarm
          ? `rgba(255,188,102,${0.08 + Math.max(0, wave) * 0.07})`
          : `rgba(125,235,255,${0.08 + Math.max(0, wave) * 0.09})`;
        x.fillRect(px, py, w, h);
        x.strokeStyle = isWarm ? "rgba(255,214,150,0.42)" : "rgba(190,250,255,0.44)";
        x.lineWidth = 0.9;
        x.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
        if ((ix + iy) % 5 === 0) {
          x.fillStyle = "rgba(255,255,255,0.12)";
          x.fillRect(px + w * 0.18, py + h * 0.18, w * 0.18, h * 0.18);
        }
      }
    }

    x.strokeStyle = "rgba(255,255,255,0.1)";
    x.lineWidth = 1;
    for (let ix = 0; ix <= cols; ix++) {
      const gx = ix * cw;
      x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, c.height); x.stroke();
    }
    for (let iy = 0; iy <= rows; iy++) {
      const gy = iy * ch;
      x.beginPath(); x.moveTo(0, gy); x.lineTo(c.width, gy); x.stroke();
    }

    return new THREE.CanvasTexture(c);
  }

  // material registry so the whole stack can fade as one
  const managed = [];
  function manage(mat) {
    mat.transparent = true;
    managed.push({
      mat,
      o: mat.opacity,
      e: mat.emissiveIntensity !== undefined ? mat.emissiveIntensity : null
    });
    return mat;
  }
  function setStackFade(f) {
    for (const m of managed) {
      m.mat.opacity = m.o * f;
      if (m.e !== null) m.mat.emissiveIntensity = m.e * f;
      m.mat.visible = f > 0.01;
    }
  }

  /* ============================================================
     MONITOR ASSEMBLY — 3 parts
     front bezel (flies UP) · liquid-crystal glass core (centre, glows)
     · back bezel (flies DOWN). A $2000 panel deconstructed.
     ============================================================ */
  const stack = new THREE.Group();
  scene.add(stack);

  const MW = 19, MH = 11.4;          // 16:9-ish monitor face (XY plane, depth = Z)

  function edges(geo, color, opacity) {
    return new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      manage(new THREE.LineBasicMaterial({ color, transparent: true, opacity }))
    );
  }

  /* brushed-metal + blueprint-grid texture for the bezels */
  function bezelTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d");
    const base = x.createLinearGradient(0, 0, 0, 256);
    base.addColorStop(0, "#222833");
    base.addColorStop(0.48, "#10141b");
    base.addColorStop(1, "#07090d");
    x.fillStyle = base;
    x.fillRect(0, 0, 256, 256);
    // fine brushed streaks
    for (let i = 0; i < 1900; i++) {
      const y = Math.random() * 256;
      x.strokeStyle = `rgba(${Math.random() < 0.55 ? "210,225,245" : "10,12,18"},${0.025 + Math.random() * 0.075})`;
      x.lineWidth = 1;
      x.beginPath(); x.moveTo(0, y); x.lineTo(256, y + (Math.random() - 0.5) * 3); x.stroke();
    }
    // subtle machined edge bands
    x.fillStyle = "rgba(255,255,255,0.035)";
    x.fillRect(0, 0, 256, 14);
    x.fillRect(0, 242, 256, 14);
    x.fillStyle = "rgba(0,0,0,0.2)";
    x.fillRect(0, 122, 256, 5);
    // blueprint grid
    x.strokeStyle = "rgba(120,180,235,0.22)";
    x.lineWidth = 1;
    for (let i = 0; i <= 256; i += 32) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  }
  const bezelMap = bezelTexture();

  /* build a rectangular monitor frame (border only) */
  function buildBezel(depth) {
    const g = new THREE.Group();
    const ft = 1.25;                 // thin premium monitor border
    const mat = manage(new THREE.MeshPhysicalMaterial({
      map: bezelMap, color: 0x232935,
      metalness: 0.9, roughness: 0.34,
      clearcoat: 0.85, clearcoatRoughness: 0.22,
      transparent: true, opacity: 0.62, side: THREE.DoubleSide
    }));
    const blueprintMat = manage(new THREE.LineBasicMaterial({
      color: 0x95d7ff, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    const bars = [
      [MW, ft, 0, (MH - ft) / 2],                 // top
      [MW, ft, 0, -(MH - ft) / 2],                // bottom
      [ft, MH - ft * 2, -(MW - ft) / 2, 0],       // left
      [ft, MH - ft * 2, (MW - ft) / 2, 0]         // right
    ];
    for (const [w, h, px, py] of bars) {
      const geo = new THREE.BoxGeometry(w, h, depth);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, 0);
      g.add(m);
      const edgeLine = edges(geo, 0x8fc4f8, 0.4);
      edgeLine.position.copy(m.position);
      g.add(edgeLine);
    }
    // outer + inner blueprint outline
    g.add(edges(new THREE.BoxGeometry(MW, MH, depth), 0x6f9fd8, 0.5));

    const linePts = [];
    const z = depth / 2 + 0.035;
    function addLine(x1, y1, x2, y2) {
      linePts.push(x1, y1, z, x2, y2, z);
    }
    const left = -MW / 2, right = MW / 2, top = MH / 2, bottom = -MH / 2;
    const innerL = left + ft, innerR = right - ft, innerT = top - ft, innerB = bottom + ft;
    for (let x = left + 1.1; x < right; x += 1.55) {
      addLine(x, innerT, x, top);
      addLine(x, bottom, x, innerB);
    }
    for (let y = bottom + 1.1; y < top; y += 1.55) {
      addLine(left, y, innerL, y);
      addLine(innerR, y, right, y);
    }
    // Inner lip outline makes the open center unmistakable.
    addLine(innerL, innerT, innerR, innerT);
    addLine(innerR, innerT, innerR, innerB);
    addLine(innerR, innerB, innerL, innerB);
    addLine(innerL, innerB, innerL, innerT);
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePts, 3));
    g.add(new THREE.LineSegments(gridGeo, blueprintMat));

    return g;
  }

  /* --- BACK BEZEL (flies down + away) --- */
  const backBezel = buildBezel(1.2);
  backBezel.position.z = -1.4;
  stack.add(backBezel);

  /* --- LIQUID-CRYSTAL GLASS CORE (centre, glowing) --- */
  const lcCore = new THREE.Group();
  stack.add(lcCore);

  const coreW = MW - 1.05, coreH = MH - 1.05, coreD = 1.95;
  const glassMat = manage(new THREE.MeshPhysicalMaterial({
    color: 0xa9f3ff, emissive: 0x082b38, emissiveIntensity: 0.58,
    metalness: 0.04, roughness: 0.035,
    transmission: 0.68, thickness: 3.6,
    clearcoat: 1.0, clearcoatRoughness: 0.045,
    transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false
  }));
  const glassMesh = new THREE.Mesh(new THREE.BoxGeometry(coreW, coreH, coreD), glassMat);
  glassMesh.renderOrder = 1;
  lcCore.add(glassMesh);
  lcCore.add(edges(new THREE.BoxGeometry(coreW, coreH, coreD), 0x4dffd0, 0.68));

  const innerGlowMat = manage(new THREE.MeshBasicMaterial({
    color: 0x66eeff, transparent: true, opacity: 0.1,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  }));
  const amberCoreMat = manage(new THREE.MeshBasicMaterial({
    color: 0xffb15f, transparent: true, opacity: 0.06,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  }));
  const innerGlow = new THREE.Mesh(new THREE.BoxGeometry(coreW * 0.94, coreH * 0.9, 0.18), innerGlowMat);
  innerGlow.position.z = -0.05;
  lcCore.add(innerGlow);
  const amberCore = new THREE.Mesh(new THREE.BoxGeometry(coreW * 0.72, coreH * 0.62, 0.16), amberCoreMat);
  amberCore.position.set(coreW * 0.08, -coreH * 0.03, 0.08);
  lcCore.add(amberCore);

  const edgeGlowMats = [];
  function addCoreEdgeGlow(w, h, x, y) {
    const mat = manage(new THREE.MeshBasicMaterial({
      color: 0x6df7ff, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    edgeGlowMats.push(mat);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), mat);
    m.position.set(x, y, coreD / 2 + 0.08);
    lcCore.add(m);
  }
  addCoreEdgeGlow(coreW, 0.12, 0, coreH / 2);
  addCoreEdgeGlow(coreW, 0.12, 0, -coreH / 2);
  addCoreEdgeGlow(0.12, coreH, -coreW / 2, 0);
  addCoreEdgeGlow(0.12, coreH, coreW / 2, 0);

  /* bright front-face sheen plane (fake reflection streak) */
  const reflectionMats = [];
  {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d");
    const grad = x.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, "rgba(255,255,255,0.5)");
    grad.addColorStop(0.32, "rgba(180,235,255,0.05)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = grad; x.fillRect(0, 0, 128, 128);
    const sheen = new THREE.Mesh(
      new THREE.PlaneGeometry(coreW, coreH),
      manage(new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false
      }))
    );
    reflectionMats.push(sheen.material);
    sheen.position.z = coreD / 2 + 0.02;
    lcCore.add(sheen);

    const c2 = document.createElement("canvas");
    c2.width = c2.height = 128;
    const y = c2.getContext("2d");
    const g2 = y.createLinearGradient(0, 128, 128, 0);
    g2.addColorStop(0, "rgba(255,176,96,0.28)");
    g2.addColorStop(0.35, "rgba(255,255,255,0.08)");
    g2.addColorStop(1, "rgba(80,225,255,0)");
    y.fillStyle = g2; y.fillRect(0, 0, 128, 128);
    const rearSheen = new THREE.Mesh(
      new THREE.PlaneGeometry(coreW * 0.96, coreH * 0.96),
      manage(new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c2), transparent: true, opacity: 0.24,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      }))
    );
    reflectionMats.push(rearSheen.material);
    rearSheen.position.z = -coreD / 2 - 0.02;
    rearSheen.rotation.y = Math.PI;
    lcCore.add(rearSheen);
  }

  /* molecular / liquid-crystal field INSIDE the glass */
  const lcLattice = new THREE.Group();
  lcLattice.renderOrder = 4;
  lcCore.add(lcLattice);
  let lcInnerMat, lcGridMat, lcRodMat;
  {
    const GX = 26, GY = 16;
    const arr = new Float32Array(GX * GY * 3);
    const col = new Float32Array(GX * GY * 3);
    let p = 0;
    for (let iy = 0; iy < GY; iy++) for (let ix = 0; ix < GX; ix++) {
      arr[p * 3]     = (ix / (GX - 1) - 0.5) * (coreW - 1.2) + (Math.random() - 0.5) * 0.3;
      arr[p * 3 + 1] = (iy / (GY - 1) - 0.5) * (coreH - 1.2) + (Math.random() - 0.5) * 0.3;
      arr[p * 3 + 2] = (Math.random() - 0.5) * (coreD - 0.4);
      // mostly cyan, occasional warm amber node
      if (Math.random() < 0.16) { col[p*3]=1.0; col[p*3+1]=0.72; col[p*3+2]=0.32; }
      else { col[p*3]=0.32; col[p*3+1]=0.95; col[p*3+2]=1.0; }
      p++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    lcInnerMat = new THREE.PointsMaterial({
      size: 0.42, map: whiteSoft, vertexColors: true,
      transparent: true, opacity: 0.55, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    lcLattice.add(new THREE.Points(geo, lcInnerMat));

    const gridPts = [];
    const zLayers = [-coreD * 0.28, coreD * 0.28];
    for (const z of zLayers) {
      for (let ix = 0; ix < GX; ix += 2) {
        const x = (ix / (GX - 1) - 0.5) * (coreW - 1.1);
        gridPts.push(x, -coreH * 0.43, z, x, coreH * 0.43, z);
      }
      for (let iy = 0; iy < GY; iy += 2) {
        const y = (iy / (GY - 1) - 0.5) * (coreH - 1.1);
        gridPts.push(-coreW * 0.46, y, z, coreW * 0.46, y, z);
      }
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3));
    lcGridMat = manage(new THREE.LineBasicMaterial({
      color: 0x78f6ff, transparent: true, opacity: 0.24,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    }));
    lcLattice.add(new THREE.LineSegments(gridGeo, lcGridMat));

    const rodPts = [];
    const rodCols = [];
    for (let iy = 0; iy < GY; iy++) for (let ix = 0; ix < GX; ix++) {
      const x = (ix / (GX - 1) - 0.5) * (coreW - 1.25);
      const y = (iy / (GY - 1) - 0.5) * (coreH - 1.25);
      const z = (Math.random() - 0.5) * (coreD - 0.6);
      const theta = (iy / (GY - 1)) * Math.PI * 0.55 + (ix % 3) * 0.13;
      const len = 0.46 + Math.random() * 0.18;
      const dx = Math.cos(theta) * len * 0.5;
      const dy = Math.sin(theta) * len * 0.5;
      rodPts.push(x - dx, y - dy, z, x + dx, y + dy, z);
      const warm = Math.random() < 0.18;
      const c = warm ? [1.0, 0.62, 0.25] : [0.35, 1.0, 0.95];
      rodCols.push(c[0], c[1], c[2], c[0], c[1], c[2]);
    }
    const rodGeo = new THREE.BufferGeometry();
    rodGeo.setAttribute("position", new THREE.Float32BufferAttribute(rodPts, 3));
    rodGeo.setAttribute("color", new THREE.Float32BufferAttribute(rodCols, 3));
    lcRodMat = manage(new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.38,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    }));
    lcLattice.add(new THREE.LineSegments(rodGeo, lcRodMat));
  }

  /* magnified pixel-shape overlay on the screen face */
  const pixelZoomGroup = new THREE.Group();
  pixelZoomGroup.renderOrder = 6;
  pixelZoomGroup.position.z = coreD / 2 + 0.16;
  lcCore.add(pixelZoomGroup);

  const pixelShapeMat = manage(new THREE.MeshBasicMaterial({
    map: pixelShapeTexture(), color: 0xffffff,
    transparent: true, opacity: 0,
    depthWrite: false, depthTest: false, side: THREE.DoubleSide
  }));
  const pixelShapePlane = new THREE.Mesh(new THREE.PlaneGeometry(coreW * 0.92, coreH * 0.82), pixelShapeMat);
  pixelShapePlane.renderOrder = 6;
  pixelZoomGroup.add(pixelShapePlane);

  const pixelOutlineMat = manage(new THREE.LineBasicMaterial({
    color: 0xd8fbff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
  }));
  const zoomBox = new THREE.BufferGeometry();
  const zw = coreW * 0.92, zh = coreH * 0.82;
  zoomBox.setAttribute("position", new THREE.Float32BufferAttribute([
    -zw/2, -zh/2, 0.02, zw/2, -zh/2, 0.02,
    zw/2, -zh/2, 0.02, zw/2, zh/2, 0.02,
    zw/2, zh/2, 0.02, -zw/2, zh/2, 0.02,
    -zw/2, zh/2, 0.02, -zw/2, -zh/2, 0.02
  ], 3));
  pixelZoomGroup.add(new THREE.LineSegments(zoomBox, pixelOutlineMat));

  /* internal glow lamp + cyan / amber glow sprites */
  const coreLamp = new THREE.PointLight(0x66e6ff, 1.1, 26);
  lcCore.add(coreLamp);
  const amberLamp = new THREE.PointLight(0xffb060, 0.5, 18);
  lcCore.add(amberLamp);

  const cyanGlow = new THREE.Sprite(manage(new THREE.SpriteMaterial({
    map: softTexture("80,225,255"), transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false
  })));
  cyanGlow.scale.set(MW * 1.5, MH * 1.5, 1);
  cyanGlow.position.z = -0.4;
  lcCore.add(cyanGlow);

  const amberGlow = new THREE.Sprite(manage(new THREE.SpriteMaterial({
    map: softTexture("255,176,96"), transparent: true, opacity: 0.1,
    blending: THREE.AdditiveBlending, depthWrite: false
  })));
  amberGlow.scale.set(MW * 0.7, MH * 0.7, 1);
  lcCore.add(amberGlow);

  /* --- FRONT BEZEL (flies up + toward camera) --- */
  const frontBezel = buildBezel(1.2);
  frontBezel.position.z = 1.4;
  stack.add(frontBezel);

  /* compact + exploded transforms for the three parts */
  const parts = [
    { grp: frontBezel, posC: new THREE.Vector3(0, 0, 1.4),  posX: new THREE.Vector3(0, 11.8, 10.5) },
    { grp: lcCore,     posC: new THREE.Vector3(0, 0, 0),    posX: new THREE.Vector3(0, 0, 0) },
    { grp: backBezel,  posC: new THREE.Vector3(0, 0, -1.4), posX: new THREE.Vector3(0, -11.8, -10.5) }
  ];
  const _pp = new THREE.Vector3();

  /* ============================================================
     MOLECULAR PARTICLE SYSTEM (cloud → helix rods → field-aligned)
     ============================================================ */
  const mol = { group: new THREE.Group(), fade: 0, m1: 0, m2: 0 };
  scene.add(mol.group);

  const LEVELS = 7, RX = 5, RZ = 3, PER_ROD = 22, LOOSE = 900;
  const RODS_N = LEVELS * RX * RZ;
  const N = RODS_N * PER_ROD + LOOSE;

  const posCloud = new Float32Array(N * 3);
  const posTwist = new Float32Array(N * 3);
  const posUp = new Float32Array(N * 3);
  const colCloud = new Float32Array(N * 3);
  const colRod = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);

  const TRIAD = [[1, 0.26, 0.4], [0.2, 1, 0.62], [0.32, 0.52, 1]];
  {
    let i = 0;
    const rodLen = 3.1, jitter = 0.14;
    for (let l = 0; l < LEVELS; l++) {
      const fl = l / (LEVELS - 1);
      const theta = fl * Math.PI / 2;                  // helix azimuth
      const cy = -7.2 + fl * 14.4;
      const dx = Math.cos(theta), dz = -Math.sin(theta);
      for (let ix = 0; ix < RX; ix++) for (let iz = 0; iz < RZ; iz++) {
        const cx = -8.4 + ix * 4.2;
        const cz = -4.4 + iz * 4.4;
        for (let p = 0; p < PER_ROD; p++) {
          const t = (p / (PER_ROD - 1) - 0.5) * rodLen;
          const jx = (Math.random() - 0.5) * jitter;
          const jy = (Math.random() - 0.5) * jitter;
          const jz = (Math.random() - 0.5) * jitter;
          // twisted (lying flat, azimuth = theta)
          posTwist[i * 3]     = cx + dx * t + jx;
          posTwist[i * 3 + 1] = cy + jy;
          posTwist[i * 3 + 2] = cz + dz * t + jz;
          // field applied (standing upright)
          posUp[i * 3]     = cx + jx;
          posUp[i * 3 + 1] = cy + t * 0.82 + jy;
          posUp[i * 3 + 2] = cz + jz;
          // raw data cloud
          const r = 13 + Math.random() * 9;
          const a = Math.random() * Math.PI * 2;
          const b = Math.acos(2 * Math.random() - 1);
          posCloud[i * 3]     = r * Math.sin(b) * Math.cos(a);
          posCloud[i * 3 + 1] = r * Math.cos(b) * 0.72;
          posCloud[i * 3 + 2] = r * Math.sin(b) * Math.sin(a);
          // colors
          const tc = TRIAD[(Math.random() * 3) | 0];
          colCloud[i * 3] = tc[0] * 0.85; colCloud[i * 3 + 1] = tc[1] * 0.85; colCloud[i * 3 + 2] = tc[2] * 0.85;
          const g = 0.78 + Math.random() * 0.3;
          colRod[i * 3] = 0.5 * g; colRod[i * 3 + 1] = 1.25 * g; colRod[i * 3 + 2] = 1.0 * g;
          i++;
        }
      }
    }
    // loose ambient data motes — identical in every state
    for (; i < N; i++) {
      const x = (Math.random() - 0.5) * 46;
      const y = (Math.random() - 0.5) * 30;
      const z = (Math.random() - 0.5) * 40;
      for (const arr of [posCloud, posTwist, posUp]) {
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
      const tc = TRIAD[(Math.random() * 3) | 0];
      colCloud[i * 3] = tc[0] * 0.5; colCloud[i * 3 + 1] = tc[1] * 0.5; colCloud[i * 3 + 2] = tc[2] * 0.5;
      colRod[i * 3] = 0.2; colRod[i * 3 + 1] = 0.42; colRod[i * 3 + 2] = 0.5;
    }
  }

  const molGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
  const colAttr = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
  molGeo.setAttribute("position", posAttr);
  molGeo.setAttribute("color", colAttr);

  const molMat = new THREE.PointsMaterial({
    size: 0.34, map: whiteSoft, vertexColors: true,
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true
  });
  const molPoints = new THREE.Points(molGeo, molMat);
  mol.group.add(molPoints);
  mol.group.visible = false;

  /* ---------------- dust backdrop ---------------- */
  let dustMat;
  {
    const n = 600;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(
        Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
      ).normalize().multiplyScalar(62 + Math.random() * 70);
      arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    dustMat = new THREE.PointsMaterial({
      color: 0x9db8e8, size: 0.26, map: whiteSoft, transparent: true,
      opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const dust = new THREE.Points(g, dustMat);
    scene.add(dust);
    dust.name = "dust";
  }

  /* ============================================================
     SCROLL DIRECTOR
     ============================================================ */
  const els = {
    hero: document.getElementById("hero"),
    briefing: document.getElementById("briefing"),
    flight: document.getElementById("flight"),
    molecules: document.getElementById("molecules"),
    timeline: document.getElementById("timeline"),
    data: document.getElementById("data"),
    end: document.getElementById("end")
  };
  const M = {}; // metrics — refreshed LIVE every frame from getBoundingClientRect
  function measure() {
    const sy = window.scrollY;
    for (const k in els) {
      if (!els[k]) continue;
      const r = els[k].getBoundingClientRect();
      M[k] = { top: r.top + sy, h: r.height };
    }
    M.vh = window.innerHeight;
  }
  measure();

  const pinP = (m) => clamp01((window.scrollY - m.top) / Math.max(1, m.h - M.vh));

  /* flight camera path */
  const keyP = [0, 0.15, 0.32, 0.5, 0.66, 0.82, 1];
  const camCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.5, 27),
    new THREE.Vector3(18, 8, 13),
    new THREE.Vector3(12, -10, 9),
    new THREE.Vector3(5, -2, 6),
    new THREE.Vector3(-2.8, 1.4, 4.3),
    new THREE.Vector3(-12, 9, 15),
    new THREE.Vector3(0, 2.5, 20)
  ], false, "catmullrom", 0.35);
  const tgtCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -3.5, 0),
    new THREE.Vector3(0, 4, -1.5),
    new THREE.Vector3(-0.8, 0.2, 0.7),
    new THREE.Vector3(0, 1.5, 0),
    new THREE.Vector3(0, 0, 0)
  ], false, "catmullrom", 0.35);
  const keyE = [0, 0, 0.42, 0.88, 1, 0.55, 0];

  function flightU(p) {
    let k = 0;
    while (k < keyP.length - 2 && p > keyP[k + 1]) k++;
    const t = clamp01((p - keyP[k]) / (keyP[k + 1] - keyP[k]));
    return { u: (k + t) / (keyP.length - 1), k, t };
  }

  /* mouse */
  const mouse = { x: 0, y: 0, wx: 0, wy: 0, active: false };
  window.addEventListener("mousemove", e => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    mouse.active = true;
  });
  const raycaster = new THREE.Raycaster();
  const hitPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hitPoint = new THREE.Vector3();

  /* segment weights */
  function weight(s, a, b, f) {
    const wIn = a === null ? 1 : smooth(a - f, a + f, s);
    const wOut = b === null ? 1 : 1 - smooth(b - f, b + f, s);
    return Math.max(0, wIn * wOut);
  }

  /* blended state container */
  const cur = {
    pos: new THREE.Vector3(0, 4, 30),
    tgt: new THREE.Vector3(0, 0, 0),
    explode: 0, stackFade: 1, molFade: 0, m1: 0, m2: 0,
    dust: 1, beam: 0, glow: 0.4, volt: 0, pixelZoom: 0
  };
  const want = {
    pos: new THREE.Vector3(), tgt: new THREE.Vector3(),
    explode: 0, stackFade: 0, molFade: 0, m1: 0, m2: 0,
    dust: 0, beam: 0, glow: 0, volt: 0, pixelZoom: 0
  };
  const tmpPos = new THREE.Vector3(), tmpTgt = new THREE.Vector3();

  const clock = new THREE.Clock();

  function director(t) {
    measure();                      // LIVE metrics — immune to layout shifts
    const s = window.scrollY;
    const f = M.vh * 0.42;

    // segment ranges (absolute px)
    const segs = [];

    /* HERO + BRIEFING — slow establishing orbit */
    {
      const w = weight(s, null, M.flight.top, f);
      if (w > 0.001) {
        const local = clamp01(s / Math.max(1, M.flight.top - M.vh));
        const a = t * 0.12;
        // slowly turning monitor, clearly visible behind the title from frame one
        tmpPos.set(Math.sin(a) * 9, 2.5 - local * 1, 30 - local * 4);
        tmpTgt.set(0, 0.5, 0);
        const fade = 0.7 + local * 0.3;
        const e = local * 0.25;     // hint of separation as you enter the briefing
        segs.push({ w, pos: tmpPos.clone(), tgt: tmpTgt.clone(),
          explode: e, stackFade: fade, molFade: 0, m1: 0, m2: 0,
          dust: 1, beam: 0.15, glow: 0.6 + Math.sin(t * 1.2) * 0.12, volt: 0, pixelZoom: 0 });
      }
    }

    /* FLIGHT — scrubbed camera path through exploding stack */
    {
      const w = weight(s, M.flight.top, M.flight.top + M.flight.h - M.vh * 0.5, f);
      if (w > 0.001) {
        const p = pinP(M.flight);
        window.PX.flightP = p;
        window.PX.flightStage = Math.min(5, Math.floor(p * 6.0));
        const { u, k, t: kt } = flightU(p);
        const e = lerp(keyE[k], keyE[k + 1], kt * kt * (3 - 2 * kt));
        // voltage demo inside stage 4 window (p ≈ 0.47–0.63)
        const sv = clamp01((p - 0.45) / 0.18);
        const volt = smooth(0.15, 0.5, sv) * (1 - smooth(0.62, 0.95, sv));
        const beam = smooth(0.74, 0.86, p) * (1 - smooth(0.97, 1.0, p) * 0.3);
        const glow = 0.35 + smooth(0.8, 0.95, p) * 0.9;
        const pixelZoom = smooth(0.56, 0.72, p) * (1 - smooth(0.9, 1.0, p));
        segs.push({ w, pos: camCurve.getPoint(u), tgt: tgtCurve.getPoint(u),
          explode: e, stackFade: 1, molFade: 0, m1: 0, m2: 0,
          dust: 0.6, beam, glow, volt, pixelZoom });
      }
    }

    /* MOLECULES — particle morph exhibit */
    {
      const w = weight(s, M.molecules.top - M.vh * 0.25, M.molecules.top + M.molecules.h - M.vh * 0.5, f);
      if (w > 0.001) {
        const p = pinP(M.molecules);
        const m1 = smooth(0.03, 0.38, p);
        const m2 = smooth(0.5, 0.82, p);
        window.PX.molPhase = p < 0.34 ? 0 : p < 0.56 ? 1 : 2;
        window.PX.molT = Math.pow(Math.cos(m2 * Math.PI / 2), 2);
        window.PX.molField = m2 > 0.2;
        tmpPos.set(mouse.x * 3, 1.5 + mouse.y * 2, 30 - p * 7);
        tmpTgt.set(0, 0, 0);
        segs.push({ w, pos: tmpPos.clone(), tgt: tmpTgt.clone(),
          explode: 0, stackFade: 0.16, molFade: 1, m1, m2,
          dust: 0.5, beam: 0, glow: 0.3, volt: 0, pixelZoom: 0 });
      }
    }

    /* TIMELINE — drifting data motes backdrop */
    {
      const w = weight(s, M.timeline.top - M.vh * 0.25, M.timeline.top + M.timeline.h - M.vh * 0.5, f);
      if (w > 0.001) {
        const p = pinP(M.timeline);
        // monitor drifts across the backdrop behind the timeline cards
        tmpPos.set(13 - p * 26, 3.5, 40);
        tmpTgt.set(0, 0, 0);
        segs.push({ w, pos: tmpPos.clone(), tgt: tmpTgt.clone(),
          explode: lerp(0.15, 0.35, p), stackFade: 0.08, molFade: 0.03, m1: 0.16, m2: 0,
          dust: 0.55, beam: 0.05, glow: 0.25, volt: 0, pixelZoom: 0 });
      }
    }

    /* DATA + OUTRO — reassembled, lit specimen */
    {
      const w = weight(s, M.data.top - M.vh * 0.4, null, f);
      if (w > 0.001) {
        const a = t * 0.05;
        tmpPos.set(Math.sin(a) * 11, 7 + Math.sin(t * 0.3) * 0.8, 36);
        tmpTgt.set(0, 5.5, 0);   // frame the specimen low, beneath the text
        segs.push({ w, pos: tmpPos.clone(), tgt: tmpTgt.clone(),
          explode: 0, stackFade: 0.55, molFade: 0, m1: 0, m2: 0,
          dust: 1, beam: 0.4, glow: 0.9 + Math.sin(t * 1.6) * 0.2, volt: 0, pixelZoom: 0 });
      }
    }

    /* blend */
    let W = 0;
    want.pos.set(0, 0, 0); want.tgt.set(0, 0, 0);
    want.explode = want.stackFade = want.molFade = want.m1 = want.m2 = 0;
    want.dust = want.beam = want.glow = want.volt = want.pixelZoom = 0;
    for (const g of segs) W += g.w;
    if (W <= 0) { segs.push({ w: 1, pos: cur.pos.clone(), tgt: cur.tgt.clone(), explode: 0, stackFade: 1, molFade: 0, m1: 0, m2: 0, dust: 1, beam: 0, glow: 0.4, volt: 0, pixelZoom: 0 }); W = 1; }
    for (const g of segs) {
      const k = g.w / W;
      want.pos.addScaledVector(g.pos, k);
      want.tgt.addScaledVector(g.tgt, k);
      want.explode += g.explode * k; want.stackFade += g.stackFade * k;
      want.molFade += g.molFade * k; want.m1 += g.m1 * k; want.m2 += g.m2 * k;
      want.dust += g.dust * k; want.beam += g.beam * k;
      want.glow += g.glow * k; want.volt += g.volt * k; want.pixelZoom += g.pixelZoom * k;
    }
  }

  /* ============================================================
     FRAME LOOP
     ============================================================ */
  const qTmp = new THREE.Quaternion();
  let lastColM1 = -1;

  function frameLoop() {
    requestAnimationFrame(frameLoop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    director(t);

    /* ease toward desired state — buttery igloo feel */
    const k = 1 - Math.exp(-5.2 * dt);
    cur.pos.lerp(want.pos, k);
    cur.tgt.lerp(want.tgt, k);
    cur.explode = lerp(cur.explode, want.explode, k);
    cur.stackFade = lerp(cur.stackFade, want.stackFade, k);
    cur.molFade = lerp(cur.molFade, want.molFade, k);
    cur.m1 = lerp(cur.m1, want.m1, k);
    cur.m2 = lerp(cur.m2, want.m2, k);
    cur.dust = lerp(cur.dust, want.dust, k);
    cur.beam = lerp(cur.beam, want.beam, k);
    cur.glow = lerp(cur.glow, want.glow, k);
    cur.volt = lerp(cur.volt, want.volt, k);
    cur.pixelZoom = lerp(cur.pixelZoom, want.pixelZoom, k);

    camera.position.copy(cur.pos);
    camera.lookAt(cur.tgt);
    window.PX.cam.x = cur.pos.x; window.PX.cam.y = cur.pos.y; window.PX.cam.z = cur.pos.z;

    /* monitor assembly — 3-part explosion */
    stack.visible = cur.stackFade > 0.01;
    if (stack.visible) {
      setStackFade(cur.stackFade);
      const e = cur.explode;

      /* front bezel up+forward, back bezel down+back, core stays */
      for (const p of parts) {
        _pp.lerpVectors(p.posC, p.posX, e);
        p.grp.position.copy(_pp);
      }
      // bezels tip slightly as they fly apart
      frontBezel.rotation.x = -e * 0.44;
      frontBezel.rotation.z = -e * 0.08;
      frontBezel.scale.setScalar(1 + e * 0.055);
      backBezel.rotation.x = e * 0.44;
      backBezel.rotation.z = e * 0.08;
      backBezel.scale.setScalar(1 + e * 0.045);

      /* the glowing glass core: brighten + tilt as the frames leave */
      const pulse = 0.72 + Math.sin(t * 1.6) * 0.1;
      const lit = (0.45 + e * 0.7) * pulse;
      const pz = cur.pixelZoom * cur.stackFade;
      const pixelDamp = 1 - cur.pixelZoom * 0.72;
      glassMat.opacity = (0.16 + e * 0.06) * cur.stackFade;
      glassMat.emissiveIntensity = lit * cur.stackFade;
      innerGlowMat.opacity = (0.06 + e * 0.09 + cur.glow * 0.04) * cur.stackFade;
      amberCoreMat.opacity = (0.035 + e * 0.06 + Math.sin(t * 1.1) * 0.012) * cur.stackFade;
      lcInnerMat.opacity = (0.42 + e * 0.1) * cur.stackFade * pixelDamp;
      lcInnerMat.size = (0.3 + Math.sin(t * 2.2) * 0.035) * (1 - cur.pixelZoom * 0.25);
      lcGridMat.opacity = (0.18 + e * 0.18) * cur.stackFade * pixelDamp;
      lcRodMat.opacity = (0.32 + e * 0.14) * cur.stackFade * pixelDamp;
      coreLamp.intensity = (0.35 + e * 0.7) * cur.stackFade;
      amberLamp.intensity = (0.16 + e * 0.24) * cur.stackFade;
      cyanGlow.material.opacity = (0.08 + e * 0.14 + cur.glow * 0.055) * cur.stackFade * (1 - cur.pixelZoom * 0.45);
      amberGlow.material.opacity = (0.05 + e * 0.08) * cur.stackFade * (1 - cur.pixelZoom * 0.35);
      edgeGlowMats.forEach((m, i) => {
        m.opacity = (0.08 + e * 0.1 + Math.sin(t * 2 + i) * 0.018) * cur.stackFade * (1 - cur.pixelZoom * 0.3);
      });
      reflectionMats.forEach((m, i) => {
        m.opacity = (0.1 + e * 0.08 + Math.sin(t * 0.9 + i * 1.7) * 0.02) * cur.stackFade;
      });
      // slow showcase rotation of the core, amplified while exploded
      lcCore.rotation.y = Math.sin(t * 0.35) * (0.1 + e * 0.28);
      lcCore.rotation.x = e * 0.12;
      lcLattice.rotation.z = Math.sin(t * 0.45) * 0.018;
      lcLattice.rotation.y = Math.sin(t * 0.38) * (0.025 + e * 0.04);
      lcLattice.scale.setScalar(1 + e * 0.018 + Math.sin(t * 1.7) * 0.003);

      /* zoomed pixel-shape overlay */
      pixelShapeMat.opacity = (0.02 + pz * 0.42) * cur.stackFade;
      pixelOutlineMat.opacity = pz * 0.36;
      pixelZoomGroup.visible = pz > 0.01;
      pixelZoomGroup.scale.setScalar(lerp(0.38, 0.86, cur.pixelZoom));
      pixelZoomGroup.position.x = lerp(-coreW * 0.12, 0, cur.pixelZoom);
      pixelZoomGroup.position.y = lerp(coreH * 0.08, 0, cur.pixelZoom);
      pixelZoomGroup.rotation.z = Math.sin(t * 0.4) * 0.015;
    }

    /* molecular particles */
    mol.group.visible = cur.molFade > 0.01;
    molMat.opacity = cur.molFade * 0.95;
    if (mol.group.visible) {
      /* hover repulsion */
      let hx = 1e9, hy = 1e9;
      if (mouse.active) {
        raycaster.setFromCamera(mouse, camera);
        if (raycaster.ray.intersectPlane(hitPlane, hitPoint)) {
          hx = hitPoint.x; hy = hitPoint.y;
        }
      }
      const pa = posAttr.array, ca = colAttr.array;
      const m1 = cur.m1, m2 = cur.m2;
      const im1 = 1 - m1, im2 = 1 - m2;
      const R = 4.6, R2 = R * R;
      for (let i = 0; i < N; i++) {
        const i3 = i * 3;
        const fx = posTwist[i3] * im2 + posUp[i3] * m2;
        const fy = posTwist[i3 + 1] * im2 + posUp[i3 + 1] * m2;
        const fz = posTwist[i3 + 2] * im2 + posUp[i3 + 2] * m2;
        let x = posCloud[i3] * im1 + fx * m1;
        let y = posCloud[i3 + 1] * im1 + fy * m1;
        let z = posCloud[i3 + 2] * im1 + fz * m1;
        // gentle ambient swim
        x += Math.sin(t * 0.7 + i * 0.37) * 0.06;
        y += Math.cos(t * 0.6 + i * 0.51) * 0.06;
        // pointer repulsion
        const ddx = x - hx, ddy = y - hy;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 0.001;
          const push = (1 - d / R) * 2.6;
          vel[i3] += (ddx / d) * push * dt * 8;
          vel[i3 + 1] += (ddy / d) * push * dt * 8;
        }
        vel[i3] *= 0.88; vel[i3 + 1] *= 0.88; vel[i3 + 2] *= 0.88;
        pa[i3] = x + vel[i3];
        pa[i3 + 1] = y + vel[i3 + 1];
        pa[i3 + 2] = z + vel[i3 + 2];
      }
      posAttr.needsUpdate = true;
      if (Math.abs(m1 - lastColM1) > 0.004) {
        lastColM1 = m1;
        for (let i = 0; i < N * 3; i++) ca[i] = colCloud[i] * (1 - m1) + colRod[i] * m1;
        colAttr.needsUpdate = true;
      }
      mol.group.rotation.y = Math.sin(t * 0.1) * 0.12;
    }

    /* dust */
    dustMat.opacity = 0.5 * cur.dust;
    const dust = scene.getObjectByName("dust");
    if (dust) dust.rotation.y = t * 0.012;

    renderer.render(scene, camera);
  }

  /* resize */
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    measure();
  });
  // re-measure after fonts/layout settle
  window.addEventListener("load", measure);
  setTimeout(measure, 600);

  frameLoop();
})();
