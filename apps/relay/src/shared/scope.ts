export const defaultApp = (apps: { id: string }[], all: boolean): string | undefined => (all ? undefined : apps[0]?.id);

export const startApp = (apps: { id: string }[], scopedAppId: string | undefined): string | undefined => scopedAppId ?? defaultApp(apps, false);

export const appName = (apps: { id: string; name: string }[], id: string | undefined, fallback: string): string => apps.find((a) => a.id === id)?.name ?? fallback;
