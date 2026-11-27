// Workers' auto-trailing-slash asset handling redirects /docs/404.html to /docs/404, so ask for the form it serves with 200.
export const DOCS_404_PATH = "/docs/404";

export const isDocsMiss = (pathname: string, status: number) => status === 404 && /^\/docs(\/|$)/.test(pathname);
