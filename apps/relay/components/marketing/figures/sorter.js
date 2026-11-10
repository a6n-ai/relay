/**
 * Sorter: a mail-sorting tray with one inlet and four outlet chutes.
 * The pointer picks a chute; that lane brightens and lifts, neighbours
 * settle. Slider is the lift height. Rest already fans the four lanes.
 */
const {
  Cam, clamp, facing, fit, prism, proj, rings, spring, stepS,
  mk, place, pointer, put, register, disposer, solid, flatDot,
} = HL;

const LANES = 4;
const BASE_W = 118, BASE_D = 72, BASE_H = 6;
const IN_W = 28, IN_D = 22, IN_H = 18;
const CH_W = 22, CH_D = 48, CH_H0 = 10;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let liftMax = value;
  const C = Cam(45, 0.5, 2.05);
  fit(
    C,
    [
      [-8, -8, -BASE_H],
      [BASE_W + 8, BASE_D + 8, -BASE_H],
      [BASE_W + 8, -8, 40],
      [-8, BASE_D + 8, 40],
    ],
    200,
    166,
  );
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  const [br, bi] = rings(-4, -4, BASE_W + 4, BASE_D + 4, 8, 1.8);
  put(solid(g), prism(P, front, br, bi, -BASE_H, 0));

  const ix0 = (BASE_W - IN_W) / 2, iy0 = 4;
  const [ir, ii] = rings(ix0, iy0, ix0 + IN_W, iy0 + IN_D, 4, 1.1);
  put(solid(g), prism(P, front, ir, ii, 0, IN_H));
  const inletDot = flatDot(g, C, 2.2, "dot m");
  place(inletDot, P(BASE_W / 2, iy0 + IN_D / 2, IN_H));

  const gap = (BASE_W - LANES * CH_W) / (LANES + 1);
  const lanes = [];
  for (let i = 0; i < LANES; i++) {
    const x0 = gap + i * (CH_W + gap);
    const y0 = BASE_D - CH_D - 2;
    const [ring, inner] = rings(x0, y0, x0 + CH_W, y0 + CH_D, 3.2, 0.9);
    const body = solid(g);
    const h = spring(CH_H0 + (i === 1 ? 4 : i === 2 ? 2 : 0));
    put(body, prism(P, front, ring, inner, 0, h.x));
    const mark = flatDot(g, C, 1.6, i === 1 ? "dot m" : "dot off");
    place(mark, P(x0 + CH_W / 2, y0 + CH_D * 0.72, h.x));
    lanes.push({ i, x0, y0, ring, inner, body, h, mark, cx: x0 + CH_W / 2 });
  }

  let over = -1;
  // TODO(owner): map lanes 1–4 to Relay channel names in the read-out
  // (Email / Text / WhatsApp / In the app), or keep neutral "lane N".
  const caption = (a) => (a < 0 ? "rest" : `lane ${a + 1}`);

  const B = register(stage, (dt) => {
    let moving = false;
    for (const ln of lanes) {
      const target =
        over < 0
          ? CH_H0 + (ln.i === 1 ? 4 : ln.i === 2 ? 2 : 0)
          : ln.i === over
            ? CH_H0 + liftMax
            : CH_H0 + Math.max(0, 3 - Math.abs(ln.i - over));
      ln.h.t = target;
      if (stepS(ln.h, dt)) moving = true;
      put(ln.body, prism(P, front, ln.ring, ln.inner, 0, ln.h.x));
      place(ln.mark, P(ln.cx, ln.y0 + CH_D * 0.72, ln.h.x));
      ln.body.sil.classList.toggle("hi", over === ln.i || (over < 0 && ln.i === 1));
      ln.mark.setAttribute("class", over === ln.i || (over < 0 && ln.i === 1) ? "dot m" : "dot off");
    }
    inletDot.setAttribute("class", over < 0 ? "dot m" : "dot off");
    return moving;
  });
  bag.add(B.unregister);

  function setActive(a) {
    if (a === over) return;
    over = a;
    read.textContent = caption(a);
    B.wake();
  }

  bag.add(
    pointer(stage, {
      move: ([sx]) => {
        let best = -1, dist = 1e9;
        for (const ln of lanes) {
          const [px] = P(ln.cx, ln.y0 + CH_D * 0.5, CH_H0);
          const d = Math.abs(px - sx);
          if (d < dist) {
            dist = d;
            best = ln.i;
          }
        }
        setActive(dist < 48 ? best : -1);
      },
      leave: () => setActive(-1),
    }),
  );
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";

  return {
    set: (v) => {
      liftMax = v;
      B.wake();
    },
    destroy: bag.dispose,
  };
}

hairline({
  name: "sorter",
  means: "One inlet, four chutes: the lane under the pointer lifts and takes the bright edge.",
  rules: [1, 2, 4, 5],
  range: [6, 14, 22],
  tour: [[150, 210], [200, 210], [250, 210], null],
  mount,
});
