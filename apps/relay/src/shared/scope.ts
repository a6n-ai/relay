export const defaultApp = (apps: { id: string }[], all: boolean): string | undefined => (all ? undefined : apps[0]?.id);
