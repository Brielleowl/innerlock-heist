// Visual effects helpers. Everything uses textContent / CSSOM; no innerHTML, no inline style attributes.
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));

export function typewrite(node, text, onTick) {
  if (reduce) {
    node.textContent = text;
    return Promise.resolve();
  }
  const per = Math.max(1, Math.ceil(text.length / 80));
  let i = 0;
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      i = Math.min(text.length, i + per);
      node.textContent = text.slice(0, i);
      onTick?.(i);
      if (i >= text.length) {
        clearInterval(timer);
        resolve();
      }
    }, 22);
  });
}

function pulse(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

export const shake = () => pulse(document.body, "shake");
export const flash = (kind) => pulse(document.getElementById("fx"), `flash-${kind}`);

export function confetti(root) {
  const colors = ["#39ff9c", "#ff3d81", "#38d6ff", "#ffb830"];
  for (let i = 0; i < 80; i += 1) {
    const c = document.createElement("i");
    c.className = "confetti";
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = `${2 + Math.random() * 2.5}s`;
    c.style.animationDelay = `${Math.random() * 0.8}s`;
    root.appendChild(c);
  }
}

export function toast(text, sub) {
  const box = document.getElementById("toasts");
  const t = document.createElement("div");
  t.className = "toast";
  const b = document.createElement("b");
  b.textContent = text;
  const s = document.createElement("span");
  s.textContent = sub;
  t.append(b, s);
  box.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
