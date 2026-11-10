"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { BellIcon, MailIcon, MessageCircleIcon, MessageSquareIcon } from "lucide-react";
import type { Channel } from "@relay/engine";
import { CHANNEL_ICON_COLOR, iconColorVar } from "@/components/ds/icon-color";
import { NAV_GROUPS } from "@/components/ds/nav";
import { channelLabel } from "@/components/ds/channels";
import { Badge, Spinner } from "../stageshow";
import "./console-demo.css";

const CHANNEL_ICON = { email: MailIcon, sms: MessageSquareIcon, whatsapp: MessageCircleIcon, in_app: BellIcon } as const;

export function ChannelGlyph({ channel, size = 20 }: { channel: Channel; size?: number }) {
  const Icon = CHANNEL_ICON[channel];
  const c = iconColorVar(CHANNEL_ICON_COLOR[channel]);
  return (
    <span className="rl-glyph" style={{ width: size, height: size, color: c }}>
      <Icon size={Math.round(size * 0.6)} strokeWidth={1.8} />
    </span>
  );
}

export { channelLabel };

/** The console's sidebar, from the real nav, with one link active. */
export function ConsoleSidebar({ active }: { active: string }) {
  return (
    <nav className="rl-side" aria-hidden>
      {NAV_GROUPS.map((g, gi) => (
        <div key={gi} className="rl-side__group">
          {g.label && <span className="rl-side__label">{g.label}</span>}
          {g.items.map((it) => (
            <span key={it.href} className="rl-nav" data-active={it.label === active || undefined}>
              <it.icon size={14} strokeWidth={1.8} style={{ color: iconColorVar(it.color) }} />
              {it.label}
            </span>
          ))}
        </div>
      ))}
    </nav>
  );
}

function Mark({ done }: { done: boolean }) {
  return (
    <span className="rl-mark" data-done={done || undefined}>
      <Spinner size={8} />
      <i className="rl-dot" />
    </span>
  );
}

/** A status pill that flips on one pill: the mark crossfades and the word's box eases. */
export function FlipBadge({ done, from, to }: { done: boolean; from: string; to: string }) {
  const words = useRef<HTMLSpanElement[]>([]);
  const [w, setW] = useState<number[]>([]);
  useLayoutEffect(() => setW(words.current.map((e) => e.offsetWidth)), []);
  const on = done ? 1 : 0;
  const shrink = w.length === 2 && w[on]! < w[1 - on]!;
  return (
    <Badge tone={done ? "success" : "neutral"} className="rl-badge" icon={<Mark done={done} />}>
      <span className="rl-label" data-shrink={shrink || undefined} style={w.length ? { width: w[on] } : undefined}>
        {[from, to].map((t, i) => (
          <span key={t} ref={(e) => { if (e) words.current[i] = e; }} className="rl-word" data-on={i === on || undefined}>
            {t}
          </span>
        ))}
      </span>
    </Badge>
  );
}
