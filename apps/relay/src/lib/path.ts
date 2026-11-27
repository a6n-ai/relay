export const trimSlash = (pathname: string) => (pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname);
