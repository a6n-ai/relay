// vite and the docs build run out of memory on small machines at Node's default heap.
export const buildEnv = (): NodeJS.ProcessEnv => ({ ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" });
