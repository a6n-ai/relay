/**
 * Gauge: a delivery dial on a squat pedestal. Four tick stops around the rim.
 * Pointer scrubs the needle; the nearest tick takes the bright edge.
 * Slider is the needle length.
 */
const {
  Cam, clamp, facing, fit, prism, proj, rings, spring, stepS, rad,
  mk, place, pointer, put, register, disposer, solid, flatDot, open, poly, circ, ringAt,
} = HL;

const TICKS = 4;
const PED = 88, PED_H = 10;
const DIAL_R = 48, DIAL_H = 7;
const CX = 80, CY = 80;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let needleLen = value;
  const C = Cam(45, 0.5, 2.55);
  fit(
    C,
    [
      [CX - PED, CY - PED, -PED_H],
      [CX + PED, CY + PED, -PED_H],
      [CX - PED, CY - PED, 36],
      [CX + PED, CY + PED, 36],
    ],
    200,
    166,
  );
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  const [pr, pi] = rings(CX - PED / 2, CY - PED / 2, CX + PED / 2, CY + PED / 2, 10, 1.6);
  put(solid(g), prism(P, front, pr, pi, -PED_H, 0));

  const dialRing = circ(DIAL_R, 24).map((s) => ({ u: CX + s.u, v: CY + s.v, nu: s.nu, nv: s.nv }));
  const dialInner = circ(DIAL_R - 2.2, 24).map((s) => ({ u: CX + s.u, v: CY + s.v, nu: s.nu, nv: s.nv }));
  put(solid(g), prism(P, front, dialRing, dialInner, 0, DIAL_H));

  const ticks = [];
  for (let i = 0; i < TICKS; i++) {
    const ang = -90 + i * (360 / TICKS);
    const a = rad(ang);
    const x = CX + Math.cos(a) * (DIAL_R - 8);
    const y = CY + Math.sin(a) * (DIAL_R - 8);
    const [tr, ti] = rings(x - 4.5, y - 4.5, x + 4.5, y + 4.5, 1.8, 0.7);
    const body = solid(g);
    const h = spring(5);
    put(body, prism(P, front, tr, ti, DIAL_H, DIAL_H + h.x));
    const mark = flatDot(g, C, 1.6, i === 0 ? "dot m" : "dot off");
    place(mark, P(x, y, DIAL_H + h.x));
    ticks.push({ i, ang, x, y, tr, ti, body, mark, h });
  }

  const needle = mk("path", { class: "nf sil hi" }, g);
  const hub = flatDot(g, C, 2.4, "dot m");
  place(hub, P(CX, CY, DIAL_H + 1));

  // Rest at tick 3 (+90°) so an answer on tick 1 (0°) or tick 0 (−90°) sweeps a large arc.
  const REST_ANG = 90;
  const angle = spring(REST_ANG);
  let over = -1;

  function needlePath(deg, len) {
    const a = rad(deg);
    const tip = P(CX + Math.cos(a) * len, CY + Math.sin(a) * len, DIAL_H + 3);
    const base = P(CX, CY, DIAL_H + 3);
    return open([base, tip]);
  }

  const caption = (a) => (a < 0 ? "rest" : `tick ${a + 1}`);

  const B = register(stage, (dt) => {
    let moving = stepS(angle, dt);
    needle.setAttribute("d", needlePath(angle.x, needleLen));
    for (const t of ticks) {
      t.h.t = over === t.i ? 34 : 3;
      if (stepS(t.h, dt)) moving = true;
      put(t.body, prism(P, front, t.tr, t.ti, DIAL_H, DIAL_H + t.h.x));
      place(t.mark, P(t.x, t.y, DIAL_H + t.h.x));
      t.body.sil.classList.toggle("hi", over === t.i);
      t.mark.setAttribute("class", over === t.i || (over < 0 && t.i === 0) ? "dot m" : "dot off");
    }
    needle.classList.toggle("hi", true);
    return moving;
  });
  bag.add(B.unregister);

  function setActive(a) {
    if (a === over) return;
    over = a;
    angle.t = a < 0 ? REST_ANG : ticks[a].ang;
    read.textContent = caption(a);
    B.wake();
  }

  bag.add(
    pointer(stage, {
      move: ([sx, sy]) => {
        let best = -1, dist = 1e9;
        for (const t of ticks) {
          const [px, py] = P(t.x, t.y, DIAL_H + 5);
          const d = (px - sx) ** 2 + (py - sy) ** 2;
          if (d < dist) {
            dist = d;
            best = t.i;
          }
        }
        setActive(dist < 55 * 55 ? best : -1);
      },
      leave: () => setActive(-1),
    }),
  );
  bag.add(() => svg.replaceChildren());
  read.textContent = "rest";

  return {
    set: (v) => {
      needleLen = v;
      B.wake();
    },
    destroy: bag.dispose,
  };
}

hairline({
  name: "gauge",
  means: "A delivery dial: the pointer picks a tick, and the needle springs to it.",
  rules: [1, 4, 5, 8],
  range: [24, 34, 42],
  tour: [[200, 120], [250, 160], [200, 220], null],
  mount,
});
