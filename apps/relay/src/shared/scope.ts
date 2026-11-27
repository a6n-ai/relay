export type Scope = { workspaceId: string; appId: string };
export type KeyScope = Scope & { keyId: string };

export const defaultApp = (apps: { id: string }[], all: boolean): string | undefined => (all ? undefined : apps[0]?.id);
