// Every R2 object key under ws/<workspaceId>/. Stored keys are never rewritten, so these strings are fixed.
const root = (workspaceId: string) => `ws/${workspaceId}/`;

export const r2Keys = {
  msgHtml: (workspaceId: string, messageId: string) => `${root(workspaceId)}msg/${messageId}.html`,
  payload: (workspaceId: string, messageId: string) => `${root(workspaceId)}msg/${messageId}.received.json`,
  attachment: (workspaceId: string, messageId: string, position: number, filename: string) =>
    `${root(workspaceId)}att/${messageId}/${position}-${filename}`,
  raw: (workspaceId: string, iso: string, uuid: string) =>
    `${root(workspaceId)}raw/${iso.slice(0, 4)}/${iso.slice(5, 7)}/${uuid}.eml`,
  rawPrefix: (workspaceId: string) => `${root(workspaceId)}raw/`,
};

export const ownedBy = (workspaceId: string, key: string) => key.startsWith(root(workspaceId));
export const ownedRaw = (workspaceId: string, key: string) => key.startsWith(r2Keys.rawPrefix(workspaceId));
