// Workers' auto-trailing-slash asset handling redirects /docs/404.html to /docs/404, so ask for the form it serves with 200.
import { DOCS_BASE } from "./shared/site";

export const DOCS_404_PATH = `${DOCS_BASE}/404`;

export const isDocsMiss = (pathname: string, status: number) => status === 404 && (pathname === DOCS_BASE || pathname.startsWith(`${DOCS_BASE}/`));
