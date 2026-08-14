// Gemeinsame 3D-Szene für alle Seiten: Drahtgitter-Globus + gestrichelter
// Orbit im Look der Metallkarte. Erwartet im Dokument: #scene (canvas),
// .brand (Header), #foot (Footer), #taglineWrap (main) mit .tagline darin.
import * as THREE from 'three';

const root = document.documentElement;

try {
  if (root.classList.contains('no-webgl')) throw new Error('fallback already active');

  const canvas = document.getElementById('scene');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);

  const COL_STEEL = 0xc7cbce;
  const steelLine = new THREE.LineBasicMaterial({
    color: COL_STEEL, transparent: true, opacity: 0.62
  });

  // ——— Globus: Meridiane + Breitenkreise als echte Linienkreise ———
  const globe = new THREE.Group();

  const circlePoints = (segments = 160) => {
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    }
    return pts;
  };
  const circleGeo = new THREE.BufferGeometry().setFromPoints(circlePoints());

  const MERIDIANS = 8;
  for (let i = 0; i < MERIDIANS; i++) {
    const line = new THREE.Line(circleGeo, steelLine);
    line.rotation.y = (i / MERIDIANS) * Math.PI;
    globe.add(line);
  }

  const LATS = [-60, -30, 0, 30, 60];
  for (const lat of LATS) {
    const rad = THREE.MathUtils.degToRad(lat);
    const r = Math.cos(rad);
    const line = new THREE.Line(circleGeo, steelLine);
    line.scale.setScalar(r);
    line.position.y = Math.sin(rad);
    line.rotation.x = Math.PI / 2;
    globe.add(line);
  }

  // Occluder: schluckt Rückseite von Gitter + Orbit (Karten-Regel:
  // "hidden behind the sphere") — schreibt nur in den Depth-Buffer.
  const occluder = new THREE.Mesh(
    new THREE.SphereGeometry(0.985, 48, 32),
    new THREE.MeshBasicMaterial({ colorWrite: false })
  );
  globe.add(occluder);

  globe.rotation.x = 0.16;
  scene.add(globe);

  // ——— Orbit: gestrichelte Ellipse — vorne unten kreuzend, nach rechts
  // steigend, wie auf der Kartenrückseite ———
  const ORBIT_RX = 1.95;
  const ORBIT_RY = 1.18;
  const orbitCurve = new THREE.EllipseCurve(0, 0, ORBIT_RX, ORBIT_RY, 0, Math.PI * 2);
  const orbitPts = orbitCurve.getPoints(320).map(p => new THREE.Vector3(p.x, p.y, 0));
  const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPts);
  const orbitMat = new THREE.LineDashedMaterial({
    color: COL_STEEL, transparent: true, opacity: 0.75,
    dashSize: 0.065, gapSize: 0.05
  });
  const orbitLine = new THREE.Line(orbitGeo, orbitMat);
  orbitLine.computeLineDistances();

  const orbitGroup = new THREE.Group();
  orbitGroup.add(orbitLine);
  orbitGroup.rotation.x = THREE.MathUtils.degToRad(-61); // unterer Bogen nach vorn
  orbitGroup.rotation.z = THREE.MathUtils.degToRad(11);  // steigt nach rechts

  // Kleiner Punkt auf der Bahn (wie auf der Kartengrafik) — im
  // Gravur-Vokabular: gleiches Stahlgrau, leicht transparent
  const sat = new THREE.Mesh(
    new THREE.SphereGeometry(0.016, 16, 12),
    new THREE.MeshBasicMaterial({ color: COL_STEEL, transparent: true, opacity: 0.9 })
  );
  orbitGroup.add(sat);
  scene.add(orbitGroup);

  // ——— Framing: rechnet gegen die real gemessene Header-/Footer-Geometrie,
  // damit der Globus nie in die Textblöcke läuft ———
  const brandEl = document.querySelector('.brand');
  const footEl = document.getElementById('foot');
  const wrapEl = document.getElementById('taglineWrap');
  const taglineEl = document.querySelector('.tagline');
  const SILHOUETTE = 1.06; // Perspektiv-Puffer über Radius 1
  // Laufweite der Tagline in em (inkl. Tracking) — pro Seite via data-em
  const TAGLINE_EM = parseFloat(taglineEl.dataset.em) || 19;

  function resize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;

    const margin = 24;
    const availTop = brandEl.getBoundingClientRect().bottom + margin;
    const availBot = footEl.getBoundingClientRect().top - margin;
    const avail = Math.max(120, availBot - availTop);

    // Pixel pro Welt-Einheit, begrenzt durch freies Höhenband,
    // Orbit-Breite und einen globalen Viewport-Deckel
    const orbitFrac = camera.aspect < 1 ? 0.92 : 0.84;
    const ppu = Math.min(
      avail / (2 * SILHOUETTE),
      (orbitFrac * w) / (2 * ORBIT_RX),
      0.25 * h
    );

    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const halfTan = Math.tan(fovRad / 2);
    camera.position.z = h / (2 * halfTan * ppu);

    // Globus-Mitte vertikal in die Mitte des freien Bands legen,
    // Tagline daran koppeln
    const centerY = (availTop + availBot) / 2;
    scene.position.y = (h / 2 - centerY) / ppu;
    wrapEl.style.top = centerY + 'px';

    // Tagline-Breite an die Orbit-Breite koppeln (Kartenproportion)
    const orbitPx = 2 * ORBIT_RX * ppu;
    taglineEl.style.fontSize =
      Math.min(orbitPx / TAGLINE_EM, 43.2, (w - 64) / TAGLINE_EM) + 'px';

    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', () => {
    resize();
    if (motionQuery.matches) renderer.render(scene, camera);
  });

  // ——— Parallax (nur Pointer, dezent) ———
  let targetX = 0, targetY = 0, curX = 0, curY = 0;
  if (window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      if (motionQuery.matches) return;
      targetY = ((e.clientX / window.innerWidth) - 0.5) * 0.12;
      targetX = ((e.clientY / window.innerHeight) - 0.5) * 0.08;
    });
  }

  // ——— Loop ———
  const clock = new THREE.Clock();
  const SPIN = 0.12;        // rad/s Globus
  const SAT_PERIOD = 36;    // s pro Orbit-Umlauf

  function setSat(t) {
    const p = orbitCurve.getPoint((t % SAT_PERIOD) / SAT_PERIOD);
    sat.position.set(p.x, p.y, 0);
  }

  function frame() {
    const t = clock.getElapsedTime();
    globe.rotation.y = t * SPIN;
    curX += (targetX - curX) * 0.04;
    curY += (targetY - curY) * 0.04;
    scene.rotation.x = curX;
    scene.rotation.y = curY;
    setSat(t);
    renderer.render(scene, camera);
  }

  function renderStill() {
    globe.rotation.y = 0.5;
    scene.rotation.x = 0;
    scene.rotation.y = 0;
    setSat(9);
    renderer.render(scene, camera);
  }

  function applyMotionMode() {
    if (motionQuery.matches) {
      renderer.setAnimationLoop(null);
      renderStill();
    } else {
      clock.start();
      renderer.setAnimationLoop(frame);
    }
  }
  motionQuery.addEventListener('change', applyMotionMode);

  resize();
  applyMotionMode();
  root.classList.add('loaded');
} catch (e) {
  root.classList.add('no-webgl', 'loaded');
}
