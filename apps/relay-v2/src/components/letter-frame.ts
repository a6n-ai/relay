const FRAME_HEAD =
  '<base target="_blank"><meta name="referrer" content="no-referrer"><style>html,body{margin:0}body{padding:16px}</style>';

// First in the document, so the letter cannot loosen it. Backstop for the sanitizer's remote-load checks.
const CSP_BLOCK =
  "default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:; media-src 'none'; frame-src 'none'; form-action 'none'";
const CSP_SHOW =
  "default-src 'none'; img-src data: https: 'self'; style-src 'unsafe-inline' https:; font-src data: https:; media-src 'none'; frame-src 'none'; form-action 'none'";

export function letterSrcDoc(htmlSafe: string, blockRemote: boolean): string {
  const csp = blockRemote ? CSP_BLOCK : CSP_SHOW;
  return `<meta http-equiv="Content-Security-Policy" content="${csp}">${FRAME_HEAD}${htmlSafe}`;
}
