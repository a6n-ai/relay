import { useEffect, type ReactNode } from "react";
import { Hint } from "../page/text";
import { ChoiceField, type ChoiceOption } from "./choice-field";

export function SenderField({
  id,
  senders,
  value,
  onChange,
  emptyAction,
}: {
  id: string;
  senders: ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  emptyAction?: ReactNode;
}) {
  const only = senders.length === 1 ? senders[0]?.value : undefined;
  useEffect(() => {
    if (only && value !== only) onChange(only);
  }, [only, value, onChange]);
  if (senders.length === 0) {
    return (
      <div className="grid gap-1.5">
        <Hint>No senders yet.</Hint>
        {emptyAction}
      </div>
    );
  }
  return <ChoiceField id={id} label="Send from" value={value} onChange={onChange} options={senders} />;
}
