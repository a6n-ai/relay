"use client";

import type { ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Collapse, Stage, Text, Window, type Act } from "../stageshow";
import { RELAY_CHANNELS } from "@/components/ds/channels";
import { ChannelGlyph, ConsoleSidebar, FlipBadge } from "./console-parts";
import "../console-look.css";
import "./send-demo.css";

// One send arrives at the top of Sends and fans out into four channel chips
// that flip from Queued to Delivered one by one; the payoff holds, then the
// row closes the way it opened.

type S = { open: boolean; shown: number; done: number };

const initial: S = { open: false, shown: 0, done: 0 };
const poster: S = { open: true, shown: 4, done: 4 };

async function script(a: Act<S>) {
  await a.wait(900);
  a.mark("arrive");
  a.put({ open: true });
  await a.wait(700);
  for (let n = 1; n <= 4; n++) {
    a.put({ shown: n });
    await a.wait(160);
  }
  await a.wait(1100);
  a.mark("delivered");
  for (let n = 1; n <= 4; n++) {
    a.put({ done: n });
    await a.wait(n === 4 ? 400 : 1000);
  }
  await a.wait(3200);
  a.put({ open: false });
  await a.wait(800);
  await a.snap({ shown: 0, done: 0 });
}

const OLD = [
  { title: "Password reset", app: "Northwind app", ch: ["email"], when: "2 min ago" },
  { title: "Welcome aboard", app: "Northwind app", ch: ["email", "in_app"], when: "14 min ago" },
  { title: "Invoice paid", app: "Billing app", ch: ["email", "sms"], when: "1 hour ago" },
  { title: "Order shipped", app: "Store app", ch: ["email", "sms", "whatsapp"], when: "3 hours ago" },
  { title: "Weekly summary", app: "Northwind app", ch: ["email"], when: "5 hours ago" },
  { title: "Appointment reminder", app: "Clinic app", ch: ["sms", "whatsapp"], when: "Yesterday" },
] as const;

function Line({ title, app, when, status, lead }: { title: string; app: string; when: string; status: ReactNode; lead: ReactNode }) {
  return (
    <div className="rl-line">
      <span className="rl-line__who">
        <span className="rl-line__title">{title}</span>
        <span className="rl-line__app">{app}</span>
      </span>
      <span className="rl-line__lead">{lead}</span>
      {status}
      <span className="rl-line__when">{when}</span>
    </div>
  );
}

function Scene({ s, compact }: { s: S; compact: boolean }) {
  const crumbs = (
    <span className="rl-crumbs">
      <Text className="rl-crumbs__muted">Activity</Text>
      <ChevronRightIcon size={12} strokeWidth={1.8} />
      <Text className="rl-crumbs__now">Sends</Text>
    </span>
  );
  const list = (
    <div className="rl-list">
      <Collapse open={s.open} reveal="drop">
        <div className="rl-send">
          <Line
            title="Order paid"
            app="Northwind app"
            when="Just now"
            lead={<span className="rl-chips-count">{s.shown > 0 ? "4 channels" : "Queued"}</span>}
            status={<FlipBadge done={s.done === 4} from="Sending" to="Delivered" />}
          />
          <div className="rl-fan">
            {RELAY_CHANNELS.map((c, i) => (
              <div key={c.key} className="rl-chan" data-on={s.shown > i || undefined}>
                <span className="rl-chan__name">
                  <ChannelGlyph channel={c.key} />
                  {c.label}
                </span>
                <FlipBadge done={s.done > i} from="Queued" to="Delivered" />
              </div>
            ))}
          </div>
        </div>
      </Collapse>
      {OLD.map((r) => (
        <Line
          key={r.title}
          title={r.title}
          app={r.app}
          when={r.when}
          lead={<span className="rl-glyphs">{r.ch.map((c) => <ChannelGlyph key={c} channel={c} size={18} />)}</span>}
          status={<FlipBadge done from="Sending" to="Delivered" />}
        />
      ))}
    </div>
  );
  return compact ? (
    <Window className="rl-win" lead={crumbs} body={{ className: "rl-body" }}>
      {list}
    </Window>
  ) : (
    <Window className="rl-win" sidebar={<ConsoleSidebar active="Sends" />} sidebarWidth={200} lead={crumbs} body={{ className: "rl-body" }}>
      {list}
    </Window>
  );
}

export function SendDemo() {
  return (
    <Stage<S>
      width={1040}
      height={520}
      compact={{ below: 700, width: 358, height: 500 }}
      theme="dark"
      fidelity="realistic"
      initial={initial}
      poster={poster}
      script={script}
      className="rl-look rl-hero"
    >
      {(s, _rect, layout) => <Scene s={s} compact={layout === "compact"} />}
    </Stage>
  );
}
