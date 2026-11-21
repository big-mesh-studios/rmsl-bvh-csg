import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from "@random-mesh/rmsl/scene";
import {
  Brush,
  Evaluator,
  ADDITION,
  SUBTRACTION,
  INTERSECTION,
  DIFFERENCE,
  computeMeshVolume,
} from "@random-mesh/rmsl-bvh-csg";

const canvas = document.createElement("canvas");
canvas.style.position = "fixed";
canvas.style.inset = "0";
canvas.style.touchAction = "none";
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
document.body.appendChild(canvas);

const renderer = new WebGLRenderer(canvas, { antialias: true });
renderer.setClearColor(new Color().setHex(0x101318));
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener("resize", () => renderer.setSize(window.innerWidth, window.innerHeight));

const scene = new Scene();
scene.add(new AmbientLight(0xffffff, 0.3));
const sun = new DirectionalLight(0xfff3e0, 2.5);
sun.position.set(6, 10, 8);
scene.add(sun);

// ground
const ground = new Mesh(new PlaneGeometry(8, 8), new MeshStandardMaterial({ color: 0x22262e, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.2;
scene.add(ground);

const materialA = new MeshStandardMaterial({ color: 0xff5533, roughness: 0.3, metalness: 0.4 });
const materialB = new MeshStandardMaterial({
  color: 0x3399ff,
  roughness: 0.3,
  metalness: 0.4,
  transparent: true,
  opacity: 0.15,
});

const brushA = new Brush(new BoxGeometry(1.6, 1.6, 1.6), materialA);
const brushB = new Brush(new SphereGeometry(1.1, 32, 24), materialB);
brushB.position.set(0.6, 0.4, 0.2);

brushA.updateMatrix();
brushA.updateMatrixWorld(true);
brushB.updateMatrix();
brushB.updateMatrixWorld(true);

const ghostA = new Mesh(
  brushA.geometry,
  new MeshStandardMaterial({ color: 0xff5533, roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.12 }),
);
ghostA.matrix.copy(brushA.matrixWorld);
ghostA.matrixAutoUpdate = false;
const ghostB = new Mesh(
  brushB.geometry,
  new MeshStandardMaterial({ color: 0x3399ff, roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.12 }),
);
ghostB.matrix.copy(brushB.matrixWorld);
ghostB.matrixAutoUpdate = false;
scene.add(ghostA, ghostB);

const resultMaterial = new MeshStandardMaterial({
  color: 0xffcc33,
  roughness: 0.2,
  metalness: 0.3,
  emissive: 0x332200,
});
const resultMesh = new Mesh(brushA.geometry, resultMaterial);
scene.add(resultMesh);

const camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(4, 3, 5);
camera.lookAt(0, 0, 0);

// orbit
let theta = 0.8;
let phi = 0.5;
let radius = 7;
let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener("pointerup", () => (dragging = false));
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  theta -= (e.clientX - lastX) * 0.005;
  phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi + (e.clientY - lastY) * 0.005));
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener(
  "wheel",
  (e) => {
    radius = Math.max(2, Math.min(20, radius + e.deltaY * 0.01));
    e.preventDefault();
  },
  { passive: false },
);

const operations: { name: string; value: number }[] = [
  { name: "ADDITION", value: ADDITION },
  { name: "SUBTRACTION", value: SUBTRACTION },
  { name: "INTERSECTION", value: INTERSECTION },
  { name: "DIFFERENCE", value: DIFFERENCE },
];

const ui = document.getElementById("ui")!;
const info = document.getElementById("info")!;
let current = SUBTRACTION;

function rebuild(): void {
  const evaluator = new Evaluator();
  const result = evaluator.evaluate(brushA, brushB, current) as Brush;
  resultMesh.geometry = result.geometry;
  resultMesh.material = resultMaterial;
  resultMesh.matrix.copy(brushA.matrixWorld);
  resultMesh.matrixAutoUpdate = false;
  info.textContent = `${operations.find((o) => o.value === current)!.name} — ${result.geometry.index!.count / 3} tris — volume ${computeMeshVolume(result).toFixed(3)}`;
  console.log("rebuilt", info.textContent);
}

for (const op of operations) {
  const btn = document.createElement("button");
  btn.textContent = op.name;
  if (op.value === current) btn.classList.add("active");
  btn.addEventListener("click", () => {
    current = op.value;
    for (const b of Array.from(ui.querySelectorAll("button"))) b.classList.remove("active");
    btn.classList.add("active");
    rebuild();
  });
  ui.appendChild(btn);
}

rebuild();

function animate(): void {
  requestAnimationFrame(animate);
  camera.position.set(
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.cos(theta),
  );
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
}
animate();
