// After `astro build`: write dist/<page>/index.md from each page's <main>, plus dist/llms.txt listing every page.
// dist is served at /docs by relay-v2, so a page at dist/api/messages/index.html lives at /docs/api/messages/.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import TurndownService from 'turndown';

const SITE = 'https://relay.a6n.ai';
const BASE = '/docs';
// Every HTML page except the 404 and Starlight's search bundle.
const PAGES = (await readdir('dist', { recursive: true }))
	.filter((f) => f.endsWith('index.html') && !f.startsWith('pagefind') && !f.startsWith('_astro'))
	.sort();

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
td.remove(['script', 'style', 'svg', 'form', 'button', 'header', 'footer']);
td.addRule('img', { filter: 'img', replacement: () => '' });
td.addRule('hidden', { filter: (n) => n.getAttribute?.('aria-hidden') === 'true', replacement: () => '' });
td.addRule('dt', { filter: 'dt', replacement: (c) => `\n\n**${c.trim()}**: ` });
td.addRule('dd', { filter: 'dd', replacement: (c) => `${c.trim()}\n` });

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const entries = [];

for (const page of PAGES) {
	let html = await readFile(`dist/${page}`, 'utf8');
	// Expressive Code's copy buttons only have a title; give them an accessible name.
	const labelled = html.replaceAll('<button title="Copy to clipboard"', '<button aria-label="Copy to clipboard" title="Copy to clipboard"');
	if (labelled !== html) await writeFile(`dist/${page}`, (html = labelled));
	const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1];
	if (!main) throw new Error(`no <main> in ${page}`);
	const body = td
		.turndown(main)
		.replace(/\]\(\//g, `](${SITE}/`)
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	await writeFile(`dist/${page.replace(/\.html$/, '.md')}`, `${body}\n`);
	const dir = page.replace(/index\.html$/, '');
	const title = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, '').trim() ?? dir);
	const description = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');
	entries.push(`- [${title}](${SITE}${BASE}/${dir}): ${description}`);
}

const llms = `# Relay

> Relay sends email for client companies through one API and a console: messages, templates, audiences, campaigns and webhooks. Docs are Markdown at each page URL plus index.md.

## Docs

${entries.join('\n')}
`;
await writeFile('dist/llms.txt', llms);
console.log(`markdown: ${PAGES.length} pages, llms.txt`);
