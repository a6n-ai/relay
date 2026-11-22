export type GridColumn =
  | { kind: "team"; teamId: string; label: string }
  | { kind: "member"; memberPublicId: string; label: string };

export type GrantTarget = { teamId: string } | { memberPublicId: string };

export type AccessState = {
  /** Grant publicId per `grantKey`. An optimistic tick has no id yet, so it holds "". */
  grants: Record<string, string>;
  pending: string[];
};

export function grantTarget(column: GridColumn): GrantTarget {
  return column.kind === "team" ? { teamId: column.teamId } : { memberPublicId: column.memberPublicId };
}

export function grantKey(mailboxPublicId: string, target: GrantTarget): string {
  return "teamId" in target
    ? `${mailboxPublicId}|team:${target.teamId}`
    : `${mailboxPublicId}|member:${target.memberPublicId}`;
}

/** Locked while a request is in flight, and while an optimistic tick still lacks its grant id (until refresh). */
export function isLocked(state: AccessState, key: string): boolean {
  return state.pending.includes(key) || state.grants[key] === "";
}

/** Null when the cell is locked, so a second click is ignored. */
export function beginToggle(state: AccessState, key: string, on: boolean): AccessState | null {
  if (isLocked(state, key)) return null;
  const grants = { ...state.grants };
  if (on) grants[key] = "";
  else delete grants[key];
  return { grants, pending: [...state.pending, key] };
}

/** `previous` is the cell's grant before `beginToggle`; a failed request puts it back. */
export function settleToggle(state: AccessState, key: string, previous: string | undefined, ok: boolean): AccessState {
  const pending = state.pending.filter((k) => k !== key);
  if (ok) return { grants: state.grants, pending };
  const grants = { ...state.grants };
  if (previous === undefined) delete grants[key];
  else grants[key] = previous;
  return { grants, pending };
}

/** Server grants replace the optimistic copy, except cells still in flight keep their optimistic value. */
export function applyServerGrants(state: AccessState, serverGrants: Record<string, string>): AccessState {
  const grants = { ...serverGrants };
  for (const key of state.pending) {
    if (key in state.grants) grants[key] = state.grants[key];
    else delete grants[key];
  }
  return { grants, pending: state.pending };
}
