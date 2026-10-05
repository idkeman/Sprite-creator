import "./style.css";

type Tool = "pencil" | "eraser" | "fill" | "eyedropper" | "line" | "rect" | "circle" | "move";

interface SpriteProject {
  width: number;
  height: number;
  pixels: string[][];
  background: string;
}

const COLORS = [
  "#000000", "#ffffff", "#ff4757", "#ff6b81", "#ffa502", "#ffd32a",
  "#2ed573", "#1e90ff", "#5352ed", "#a55eea", "#ff7f50", "#8e8e93"
];

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

const state = {
  project: createProject(32, 32),
  tool: "pencil" as Tool,
  color: "#ffffff",
  zoom: 16,
  grid: true,
  mirrorX: false,
  mirrorY: false,
  onion: false,
  undo: [] as SpriteProject[],
  redo: [] as SpriteProject[],
  drawing: false,
  lastCell: null as { x: number; y: number } | null
};

function createProject(width: number, height: number): SpriteProject {
  return {
    width,
    height,
    background: "transparent",
    pixels: Array.from({ length: height }, () => Array(width).fill(""))
  };
}

function cloneProject(project: SpriteProject): SpriteProject {
  return {
    ...project,
    pixels: project.pixels.map(row => [...row])
  };
}

app.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="logo">✦</span><div><strong>Sprite Forge</strong><small>TypeScript Sprite Creator</small></div></div>
    <div class="top-actions">
      <button id="newBtn">New</button>
      <button id="importBtn">Import</button>
      <button id="saveBtn" class="primary">Export PNG</button>
      <button id="exportJsonBtn">Export JSON</button>
      <input id="fileInput" type="file" accept="image/png,image/jpeg,image/webp" hidden>
    </div>
  </header>
  <main class="workspace">
    <aside class="panel left">
      <section><h3>Tools</h3><div class="tool-grid" id="tools"></div></section>
      <section><h3>Colors</h3><div class="color-row" id="colors"></div>
        <div class="color-editor"><input id="colorInput" type="color" value="#ffffff"><input id="hexInput" value="#ffffff" maxlength="7"></div>
      </section>
      <section><h3>Options</h3>
        <label class="toggle"><input id="gridToggle" type="checkbox" checked><span>Grid</span></label>
        <label class="toggle"><input id="mirrorX" type="checkbox"><span>Mirror X</span></label>
        <label class="toggle"><input id="mirrorY" type="checkbox"><span>Mirror Y</span></label>
        <label class="toggle"><input id="onion" type="checkbox"><span>Onion preview</span></label>
      </section>
    </aside>
    <section class="canvas-area">
      <div class="canvas-toolbar">
        <div><button id="zoomOut">−</button><span id="zoomLabel">1600%</span><button id="zoomIn">+</button><button id="fitBtn">Fit</button></div>
        <span id="status">32 × 32</span>
      </div>
      <div class="canvas-wrap" id="canvasWrap"><canvas id="editor"></canvas></div>
      <div class="hint">Left click: draw · Right click: erase · Shift: temporary eyedropper · Wheel: zoom</div>
    </section>
    <aside class="panel right">
      <section><h3>Sprite</h3>
        <div class="field-row"><label>Width<input id="widthInput" type="number" min="1" max="128" value="32"></label><label>Height<input id="heightInput" type="number" min="1" max="128" value="32"></label></div>
        <button id="resizeBtn" class="wide">Resize canvas</button>
      </section>
      <section><h3>History</h3><div class="history-buttons"><button id="undoBtn">↶ Undo</button><button id="redoBtn">↷ Redo</button></div></section>
      <section><h3>Palette</h3><div class="palette-name">Pixel palette <span>12 colors</span></div><button id="clearBtn" class="danger wide">Clear sprite</button></section>
      <section><h3>Keyboard</h3><div class="keys"><span>P</span> Pencil <span>E</span> Eraser <span>G</span> Fill <span>I</span> Picker <span>Ctrl+Z</span> Undo</div></section>
    </aside>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#editor")!;
const ctx = canvas.getContext("2d")!;
const wrap = document.querySelector<HTMLDivElement>("#canvasWrap")!;

const toolDefs: [Tool, string, string][] = [
  ["pencil", "✎", "Pencil"], ["eraser", "⌫", "Eraser"], ["fill", "▧", "Fill"],
  ["eyedropper", "⌕", "Picker"], ["line", "╱", "Line"], ["rect", "□", "Rectangle"],
  ["circle", "○", "Circle"], ["move", "✥", "Move"]
];

const tools = document.querySelector<HTMLDivElement>("#tools")!;
tools.innerHTML = toolDefs.map(([id, icon, label]) => `<button class="tool ${id === state.tool ? "active" : ""}" data-tool="${id}" title="${label}"><b>${icon}</b><span>${label}</span></button>`).join("");

const colors = document.querySelector<HTMLDivElement>("#colors")!;
colors.innerHTML = COLORS.map(c => `<button class="swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`).join("");

function saveHistory(): void {
  state.undo.push(cloneProject(state.project));
  if (state.undo.length > 50) state.undo.shift();
  state.redo = [];
}

function setTool(tool: Tool): void {
  state.tool = tool;
  document.querySelectorAll(".tool").forEach(el => el.classList.toggle("active", (el as HTMLElement).dataset.tool === tool));
}

function setColor(color: string): void {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
  state.color = color.toLowerCase();
  (document.querySelector("#colorInput") as HTMLInputElement).value = state.color;
  (document.querySelector("#hexInput") as HTMLInputElement).value = state.color;
  document.querySelectorAll(".swatch").forEach(el => el.classList.toggle("selected", (el as HTMLElement).dataset.color === state.color));
}

function draw(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = state.project.width * state.zoom * dpr;
  canvas.height = state.project.height * state.zoom * dpr;
  canvas.style.width = `${state.project.width * state.zoom}px`;
  canvas.style.height = `${state.project.height * state.zoom}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = state.project.width * state.zoom, h = state.project.height * state.zoom;

  ctx.clearRect(0, 0, w, h);
  const tile = 8;
  for (let y = 0; y < h; y += tile) for (let x = 0; x < w; x += tile) {
    ctx.fillStyle = ((x / tile + y / tile) % 2 === 0) ? "#20242c" : "#292e37";
    ctx.fillRect(x, y, tile, tile);
  }

  for (let y = 0; y < state.project.height; y++) for (let x = 0; x < state.project.width; x++) {
    const color = state.project.pixels[y][x];
    if (color) {
      ctx.fillStyle = color;
      ctx.fillRect(x * state.zoom, y * state.zoom, state.zoom, state.zoom);
    }
  }

  if (state.onion) {
    ctx.globalAlpha = .12;
    for (let y = 0; y < state.project.height; y++) for (let x = 0; x < state.project.width; x++) {
      if ((x + y) % 5 === 0) { ctx.fillStyle = "#ff5ea8"; ctx.fillRect(x * state.zoom, y * state.zoom, state.zoom, state.zoom); }
    }
    ctx.globalAlpha = 1;
  }

  if (state.grid && state.zoom >= 5) {
    ctx.strokeStyle = "rgba(255,255,255,.11)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= state.project.width; x++) { ctx.moveTo(x * state.zoom + .5, 0); ctx.lineTo(x * state.zoom + .5, h); }
    for (let y = 0; y <= state.project.height; y++) { ctx.moveTo(0, y * state.zoom + .5); ctx.lineTo(w, y * state.zoom + .5); }
    ctx.stroke();
  }
  document.querySelector("#status")!.textContent = `${state.project.width} × ${state.project.height}`;
  document.querySelector("#zoomLabel")!.textContent = `${Math.round(state.zoom / 16 * 100)}%`;
}

function cellFromEvent(e: MouseEvent): {x:number;y:number} | null {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / state.zoom);
  const y = Math.floor((e.clientY - r.top) / state.zoom);
  return x >= 0 && y >= 0 && x < state.project.width && y < state.project.height ? {x,y} : null;
}

function plot(x: number, y: number, color: string): void {
  if (x < 0 || y < 0 || x >= state.project.width || y >= state.project.height) return;
  state.project.pixels[y][x] = color;
}

function mirroredCells(x: number, y: number): {x:number;y:number}[] {
  const xs = state.mirrorX ? [x, state.project.width - 1 - x] : [x];
  const ys = state.mirrorY ? [y, state.project.height - 1 - y] : [y];
  return xs.flatMap(px => ys.map(py => ({x:px,y:py})));
}

function floodFill(x: number, y: number, color: string): void {
  const target = state.project.pixels[y][x];
  if (target === color) return;
  const stack = [[x,y]];
  while (stack.length) {
    const [cx,cy] = stack.pop()!;
    if (cx < 0 || cy < 0 || cx >= state.project.width || cy >= state.project.height) continue;
    if (state.project.pixels[cy][cx] !== target) continue;
    state.project.pixels[cy][cx] = color;
    stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
  }
}

function line(x0:number,y0:number,x1:number,y1:number,color:string): void {
  const dx=Math.abs(x1-x0), sx=x0<x1?1:-1, dy=-Math.abs(y1-y0), sy=y0<y1?1:-1;
  let err=dx+dy;
  while(true){ mirroredCells(x0,y0).forEach(p=>plot(p.x,p.y,color)); if(x0===x1&&y0===y1)break; const e2=2*err;if(e2>=dy){err+=dy;x0+=sx}if(e2<=dx){err+=dx;y0+=sy} }
}

function stamp(tool: Tool, cell:{x:number;y:number}, end=cell): void {
  const color = tool === "eraser" ? "" : state.color;
  if (tool === "pencil" || tool === "eraser") mirroredCells(cell.x,cell.y).forEach(p=>plot(p.x,p.y,color));
  else if (tool === "fill") floodFill(cell.x,cell.y,color);
  else if (tool === "eyedropper") {
    const picked=state.project.pixels[cell.y][cell.x]; if(picked) setColor(picked);
  } else if (tool === "line") line(cell.x,cell.y,end.x,end.y,color);
  else if (tool === "rect") {
    for(let x=Math.min(cell.x,end.x);x<=Math.max(cell.x,end.x);x++){plot(x,cell.y,color);plot(x,end.y,color)}
    for(let y=Math.min(cell.y,end.y);y<=Math.max(cell.y,end.y);y++){plot(cell.x,y,color);plot(end.x,y,color)}
  } else if (tool === "circle") {
    const rx=Math.abs(end.x-cell.x), ry=Math.abs(end.y-cell.y), cx=(cell.x+end.x)/2, cy=(cell.y+end.y)/2;
    for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++)for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){
      const nx=rx?((x-cx)/rx):0, ny=ry?((y-cy)/ry):0; if(Math.abs(nx*nx+ny*ny-1)<.18)plot(x,y,color);
    }
  }
}

canvas.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("mousedown", e => {
  const cell=cellFromEvent(e); if(!cell) return;
  if(e.button===2){saveHistory();stamp("eraser",cell);draw();return}
  if(e.shiftKey){stamp("eyedropper",cell);return}
  saveHistory(); state.drawing=true; state.lastCell=cell;
  stamp(state.tool,cell); draw();
});
window.addEventListener("mouseup",()=>{state.drawing=false;state.lastCell=null});
canvas.addEventListener("mousemove",e=>{
  if(!state.drawing)return; const cell=cellFromEvent(e);if(!cell)return;
  if(state.tool==="pencil"||state.tool==="eraser"){stamp(state.tool,cell);draw()} else {draw();state.lastCell=cell}
});
canvas.addEventListener("wheel",e=>{e.preventDefault();state.zoom=Math.max(2,Math.min(40,state.zoom+(e.deltaY<0?2:-2)));draw()},{passive:false});

document.querySelector("#tools")!.addEventListener("click",e=>{const el=(e.target as HTMLElement).closest<HTMLButtonElement>("[data-tool]");if(el)setTool(el.dataset.tool as Tool)});
document.querySelector("#colors")!.addEventListener("click",e=>{const el=(e.target as HTMLElement).closest<HTMLElement>("[data-color]");if(el)setColor(el.dataset.color!)});
(document.querySelector("#colorInput") as HTMLInputElement).addEventListener("input",e=>setColor((e.target as HTMLInputElement).value));
(document.querySelector("#hexInput") as HTMLInputElement).addEventListener("change",e=>setColor((e.target as HTMLInputElement).value));
document.querySelector("#gridToggle")!.addEventListener("change",e=>{state.grid=(e.target as HTMLInputElement).checked;draw()});
document.querySelector("#mirrorX")!.addEventListener("change",e=>state.mirrorX=(e.target as HTMLInputElement).checked);
document.querySelector("#mirrorY")!.addEventListener("change",e=>state.mirrorY=(e.target as HTMLInputElement).checked);
document.querySelector("#onion")!.addEventListener("change",e=>{state.onion=(e.target as HTMLInputElement).checked;draw()});
document.querySelector("#zoomIn")!.addEventListener("click",()=>{state.zoom=Math.min(40,state.zoom+2);draw()});
document.querySelector("#zoomOut")!.addEventListener("click",()=>{state.zoom=Math.max(2,state.zoom-2);draw()});
document.querySelector("#fitBtn")!.addEventListener("click",()=>{
  const available=Math.min(wrap.clientWidth-40,wrap.clientHeight-40);
  state.zoom=Math.max(2,Math.min(40,Math.floor(available/Math.max(state.project.width,state.project.height))));
  draw();
});
document.querySelector("#undoBtn")!.addEventListener("click",()=>{const p=state.undo.pop();if(p){state.redo.push(cloneProject(state.project));state.project=p;syncSize();draw()}});
document.querySelector("#redoBtn")!.addEventListener("click",()=>{const p=state.redo.pop();if(p){state.undo.push(cloneProject(state.project));state.project=p;syncSize();draw()}});
document.querySelector("#clearBtn")!.addEventListener("click",()=>{saveHistory();state.project.pixels=state.project.pixels.map(r=>r.map(()=> ""));draw()});
document.querySelector("#newBtn")!.addEventListener("click",()=>{saveHistory();state.project=createProject(32,32);syncSize();draw()});
document.querySelector("#resizeBtn")!.addEventListener("click",()=>{
  const w=Number((document.querySelector("#widthInput") as HTMLInputElement).value);
  const h=Number((document.querySelector("#heightInput") as HTMLInputElement).value);
  if(w<1||h<1||w>128||h>128)return;
  saveHistory();const next=createProject(w,h);
  for(let y=0;y<Math.min(h,state.project.height);y++)for(let x=0;x<Math.min(w,state.project.width);x++)next.pixels[y][x]=state.project.pixels[y][x];
  state.project=next;syncSize();draw();
});

function syncSize():void {
  (document.querySelector("#widthInput") as HTMLInputElement).value=String(state.project.width);
  (document.querySelector("#heightInput") as HTMLInputElement).value=String(state.project.height);
}

function exportPng():void {
  const scale=4, out=document.createElement("canvas");out.width=state.project.width*scale;out.height=state.project.height*scale;
  const c=out.getContext("2d")!;for(let y=0;y<state.project.height;y++)for(let x=0;x<state.project.width;x++){const p=state.project.pixels[y][x];if(p){c.fillStyle=p;c.fillRect(x*scale,y*scale,scale,scale)}}
  out.toBlob(blob=>{if(!blob)return;const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="sprite.png";a.click();URL.revokeObjectURL(a.href)},"image/png");
}
document.querySelector("#saveBtn")!.addEventListener("click",exportPng);
document.querySelector("#exportJsonBtn")!.addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify(state.project,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="sprite.json";a.click();URL.revokeObjectURL(a.href);
});
const input=document.querySelector<HTMLInputElement>("#fileInput")!;
document.querySelector("#importBtn")!.addEventListener("click",()=>input.click());
input.addEventListener("change",()=>{
  const file=input.files?.[0];if(!file)return;const img=new Image();img.onload=()=>{
    saveHistory();const max=128, w=Math.min(max,img.naturalWidth),h=Math.min(max,img.naturalHeight);const temp=document.createElement("canvas");temp.width=w;temp.height=h;temp.getContext("2d")!.drawImage(img,0,0,w,h);
    const data=temp.getContext("2d")!.getImageData(0,0,w,h).data;const next=createProject(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(data[i+3]>20)next.pixels[y][x]=`#${[data[i],data[i+1],data[i+2]].map(v=>v.toString(16).padStart(2,"0")).join("")}`}
    state.project=next;syncSize();draw();
  };img.src=URL.createObjectURL(file);
});
window.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();(e.shiftKey?document.querySelector<HTMLButtonElement>("#redoBtn"):document.querySelector<HTMLButtonElement>("#undoBtn"))?.click()}
  else if(e.key.toLowerCase()==="p")setTool("pencil");else if(e.key.toLowerCase()==="e")setTool("eraser");else if(e.key.toLowerCase()==="g")setTool("fill");else if(e.key.toLowerCase()==="i")setTool("eyedropper");
});
setColor("#ffffff");
draw();
