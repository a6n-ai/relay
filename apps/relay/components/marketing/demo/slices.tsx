"use client";

import { Avatar, Badge, Meter, Row, Stage, Text, Window } from "../stageshow";
import { ChannelGlyph } from "./console-parts";
import "../console-look.css";
import "./slices.css";

const MAIL: readonly { who: string; subject: string; line: string; when: string; unread?: boolean }[] = [
  { who: "Maya Rao", subject: "Re: Your invoice", line: "Thanks, paid this morning.", when: "9:41", unread: true },
  { who: "Theo Lindqvist", subject: "Booking for Friday", line: "Can we move it to the afternoon?", when: "8:15" },
  { who: "Ines Duarte", subject: "Welcome aboard", line: "Glad to be here, quick question.", when: "Yesterday" },
  { who: "Noor Haddad", subject: "Receipt 2041", line: "Got it, all sorted.", when: "Yesterday" },
  { who: "Sam Okafor", subject: "Delivery window", line: "Anytime after noon works.", when: "Mon" },
];

/** A still slice of Inbox: mailboxes on your own domain. */
export function InboxSlice() {
  return (
    <Stage width={560} height={380} fidelity="realistic" theme="dark" className="rl-look rl-slice">
      {() => (
        <Window className="rl-slice__win" lead={<Text className="rl-slice__title">Inbox</Text>} toolbar={<Text className="rl-slice__host">hello@northwind.com</Text>} body={{ className: "rl-slice__body" }}>
          {MAIL.map((m, i) => (
            <Row
              key={m.who}
              selected={i === 0}
              unread={m.unread}
              lead={<Avatar name={m.who} size={28} />}
              title={<Text className="rl-slice__who">{m.who}</Text>}
              meta={<Text className="rl-slice__when">{m.when}</Text>}
              subtitle={<Text className="rl-slice__line">{`${m.subject}, ${m.line}`}</Text>}
            />
          ))}
        </Window>
      )}
    </Stage>
  );
}

const CAMPAIGNS = [
  { name: "Spring offer", channels: ["email", "in_app"], value: 0.72, label: "Sending" },
  { name: "Back in stock", channels: ["email"], value: 1, label: "Sent" },
  { name: "Product update", channels: ["email", "in_app"], value: 1, label: "Sent" },
  { name: "Holiday hours", channels: ["email"], value: 0, label: "Scheduled" },
] as const;

/** A still slice of Campaigns: one message to many people. */
export function CampaignsSlice() {
  return (
    <Stage width={560} height={380} fidelity="realistic" theme="dark" className="rl-look rl-slice">
      {() => (
        <Window className="rl-slice__win" lead={<Text className="rl-slice__title">Campaigns</Text>} body={{ className: "rl-slice__body" }}>
          {CAMPAIGNS.map((c) => (
            <div key={c.name} className="rl-camp">
              <span className="rl-camp__name">
                <Text className="rl-slice__who">{c.name}</Text>
                <span className="rl-camp__ch">
                  {c.channels.map((ch) => (
                    <ChannelGlyph key={ch} channel={ch} size={18} />
                  ))}
                </span>
              </span>
              <Meter value={c.value} tone={c.value === 1 ? "success" : "accent"} className="rl-camp__meter" />
              <Badge tone={c.value === 1 ? "success" : c.value > 0 ? "accent" : "neutral"}>{c.label}</Badge>
            </div>
          ))}
        </Window>
      )}
    </Stage>
  );
}

const TIMELINE = [
  { label: "Queued", tone: "neutral", note: "Waiting to go out", when: "9:41:02" },
  { label: "Sent", tone: "accent", note: "Handed to the provider", when: "9:41:03" },
  { label: "Delivered", tone: "success", note: "Accepted by the recipient", when: "9:41:05" },
] as const;

/** A still slice of Delivery: one message's timeline, and a bounce that stops future sends. */
export function DeliverySlice() {
  return (
    <Stage width={560} height={380} fidelity="realistic" theme="dark" className="rl-look rl-slice">
      {() => (
        <Window className="rl-slice__win" lead={<Text className="rl-slice__title">Order paid</Text>} toolbar={<Text className="rl-slice__host">ops@northwind.com</Text>} body={{ className: "rl-slice__body" }}>
          {TIMELINE.map((t) => (
            <Row
              key={t.label}
              title={<Badge tone={t.tone}>{t.label}</Badge>}
              meta={<Text className="rl-slice__when">{t.when}</Text>}
              subtitle={<Text className="rl-slice__line">{t.note}</Text>}
            />
          ))}
          <Row
            title={<Badge tone="danger">Bounced</Badge>}
            meta={<Text className="rl-slice__when">9:52</Text>}
            subtitle={<Text className="rl-slice__line">Blocked from future sends</Text>}
          />
        </Window>
      )}
    </Stage>
  );
}

const TEAM = [
  { who: "Maya Rao", email: "maya@northwind.com", role: "Owner", tone: "accent" },
  { who: "Theo Lindqvist", email: "theo@northwind.com", role: "Admin", tone: "neutral" },
  { who: "Ines Duarte", email: "ines@northwind.com", role: "Member", tone: "neutral" },
  { who: "Noor Haddad", email: "noor@northwind.com", role: "Member", tone: "neutral" },
] as const;

/** A still slice of Team: one workspace and the people in it. */
export function TeamSlice() {
  return (
    <Stage width={560} height={380} fidelity="realistic" theme="dark" className="rl-look rl-slice">
      {() => (
        <Window className="rl-slice__win" lead={<Text className="rl-slice__title">Team</Text>} toolbar={<Text className="rl-slice__host">Northwind</Text>} body={{ className: "rl-slice__body" }}>
          {TEAM.map((m) => (
            <Row
              key={m.email}
              lead={<Avatar name={m.who} size={28} />}
              title={<Text className="rl-slice__who">{m.who}</Text>}
              meta={<Badge tone={m.tone}>{m.role}</Badge>}
              subtitle={<Text className="rl-slice__line">{m.email}</Text>}
            />
          ))}
        </Window>
      )}
    </Stage>
  );
}
