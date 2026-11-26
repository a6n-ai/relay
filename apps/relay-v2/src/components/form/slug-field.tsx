import { useEffect, useState } from "react";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Hint } from "../page/text";
import { slugify } from "./slugify";

export function SlugField({
  id,
  name,
  value,
  onChange,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (slug: string) => void;
}) {
  const [edited, setEdited] = useState(false);
  const shown = edited ? value : slugify(name);
  useEffect(() => {
    if (!edited && shown !== value) onChange(shown);
  }, [edited, shown, value, onChange]);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Slug</Label>
      <Input
        id={id}
        value={shown}
        className="font-mono"
        autoComplete="off"
        onChange={(e) => {
          setEdited(true);
          onChange(e.target.value);
        }}
      />
      <Hint size="xs">Can't be changed later.</Hint>
    </div>
  );
}
