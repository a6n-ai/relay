import { useEffect } from "react";
import { ChoiceField, type ChoiceOption } from "./choice-field";
import { EmptyChoice } from "./empty-choice";

export function SenderField({
  id,
  senders,
  value,
  onChange,
  onNavigate,
  error,
  onClearError,
}: {
  id: string;
  senders: ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  onNavigate?: () => void;
  error?: string | null;
  onClearError?: () => void;
}) {
  const only = senders.length === 1 ? senders[0]?.value : undefined;
  useEffect(() => {
    if (only && value !== only) onChange(only);
  }, [only, value, onChange]);
  if (senders.length === 0) {
    return (
      <EmptyChoice
        id={id}
        label="Send from"
        message="No sender addresses yet."
        to="/domains/addresses/new"
        linkLabel="Add an address"
        onNavigate={onNavigate}
        error={error}
      />
    );
  }
  return <ChoiceField id={id} label="Send from" value={value} onChange={onChange} options={senders} error={error} onClearError={onClearError} />;
}
