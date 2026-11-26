import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Served by relay-v2 at relay.a6n.ai/docs: its build copies dist into public/docs (apps/relay-v2/scripts/build-docs.ts).
export default defineConfig({
	site: 'https://relay.a6n.ai',
	base: '/docs',
	integrations: [
		starlight({
			title: 'Relay',
			description: 'Docs for Relay: send email, manage audiences and campaigns, and receive webhooks through one API.',
			favicon: '/favicon.svg',
			customCss: ['./src/styles/starlight.css'],
			editLink: { baseUrl: 'https://github.com/a6n-ai/relay/edit/main/apps/relay-docs/' },
			lastUpdated: false,
			head: [
				{ tag: 'meta', attrs: { property: 'og:site_name', content: 'Relay' } },
				{ tag: 'meta', attrs: { property: 'og:image', content: 'https://relay.a6n.ai/landing/og.png' } },
				{ tag: 'meta', attrs: { property: 'og:image:alt', content: 'Relay docs' } },
				{ tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
				{ tag: 'link', attrs: { rel: 'alternate', type: 'text/plain', href: '/docs/llms.txt', title: 'LLM summary' } },
			],
			components: {
				Header: './src/components/docs/Header.astro',
				Sidebar: './src/components/docs/Sidebar.astro',
				ThemeProvider: './src/components/docs/ThemeProvider.astro',
			},
			sidebar: [
				{
					label: 'Getting started',
					items: [
						{ label: 'Overview', slug: 'index', attrs: { 'data-icon': 'home' } },
						{ label: 'Quickstart', slug: 'quickstart', attrs: { 'data-icon': 'start' } },
						{ label: 'Concepts', slug: 'concepts', attrs: { 'data-icon': 'grid' } },
					],
				},
				{
					label: 'Sending',
					items: [
						{ label: 'Messages', slug: 'sending/messages', attrs: { 'data-icon': 'mail' } },
						{ label: 'Templates', slug: 'sending/templates', attrs: { 'data-icon': 'paste' } },
						{ label: 'Domains', slug: 'sending/domains', attrs: { 'data-icon': 'cloud' } },
						{ label: 'Streams', slug: 'sending/streams', attrs: { 'data-icon': 'queues' } },
						{ label: 'Limits', slug: 'sending/limits', attrs: { 'data-icon': 'speed' } },
					],
				},
				{
					label: 'Audiences',
					items: [
						{ label: 'Lists', slug: 'audiences/lists', attrs: { 'data-icon': 'queues' } },
						{ label: 'Contacts', slug: 'audiences/contacts', attrs: { 'data-icon': 'folder' } },
						{ label: 'Consent', slug: 'audiences/consent', attrs: { 'data-icon': 'verify' } },
						{ label: 'Suppressions', slug: 'audiences/suppressions', attrs: { 'data-icon': 'shield' } },
						{ label: 'Audience hook', slug: 'audiences/audience-hook', attrs: { 'data-icon': 'link' } },
					],
				},
				{
					label: 'Campaigns',
					items: [
						{ label: 'Campaigns', slug: 'campaigns/campaigns', attrs: { 'data-icon': 'share' } },
						{ label: 'Automations', slug: 'campaigns/automations', attrs: { 'data-icon': 'refresh' } },
						{ label: 'Stats', slug: 'campaigns/stats', attrs: { 'data-icon': 'chart' } },
					],
				},
				{
					label: 'Webhooks',
					items: [
						{ label: 'Events', slug: 'webhooks/events', attrs: { 'data-icon': 'calendar' } },
						{ label: 'Signatures', slug: 'webhooks/signatures', attrs: { 'data-icon': 'verify' } },
						{ label: 'Retries', slug: 'webhooks/retries', attrs: { 'data-icon': 'resume' } },
					],
				},
				{
					label: 'API reference',
					items: [
						{ label: 'Overview', slug: 'api', attrs: { 'data-icon': 'code' } },
						{ label: 'Messages', slug: 'api/messages', attrs: { 'data-icon': 'mail' } },
						{ label: 'Templates', slug: 'api/templates', attrs: { 'data-icon': 'paste' } },
						{ label: 'Lists', slug: 'api/lists', attrs: { 'data-icon': 'queues' } },
						{ label: 'Campaigns', slug: 'api/campaigns', attrs: { 'data-icon': 'share' } },
						{ label: 'Webhooks', slug: 'api/webhooks', attrs: { 'data-icon': 'link' } },
						{ label: 'Audience hook', slug: 'api/audience-hook', attrs: { 'data-icon': 'filter' } },
						{ label: 'Import', slug: 'api/import', attrs: { 'data-icon': 'download' } },
					],
				},
				{
					label: 'Worker binding',
					items: [
						{ label: 'Worker binding', slug: 'worker-binding', attrs: { 'data-icon': 'engine' } },
					],
				},
				{
					label: 'Help',
					items: [
						{ label: 'Errors', slug: 'help/errors', attrs: { 'data-icon': 'help' } },
						{ label: 'Troubleshooting', slug: 'help/troubleshooting', attrs: { 'data-icon': 'settings' } },
						{ label: 'Support', slug: 'help/support', attrs: { 'data-icon': 'mail' } },
					],
				},
			],
		}),
	],
});
