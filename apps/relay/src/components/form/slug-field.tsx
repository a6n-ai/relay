import { useEffect, useState } from "react";
import { TextField } from "./text-field";
import { slugify } from "./slugify";

export function SlugField({
  id,
  name,
  value,
  onChange,
  error,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (slug: string) => void;
  error?: string | null;
}) {
  const [edited, setEdited] = useState(false);
  const shown = edited ? value : slugify(name);
  useEffect(() => {
    if (!edited && shown !== value) onChange(shown);
  }, [edited, shown, value, onChange]);
  return (
    <TextField
      id={id}
      label="Short name"
      hint="Used in API requests. Can't be changed later."
      error={error}
      value={shown}
      className="font-mono"
      autoComplete="off"
      onChange={(e) => {
        setEdited(true);
        onChange(e.target.value);
      }}
    />
  );
}
