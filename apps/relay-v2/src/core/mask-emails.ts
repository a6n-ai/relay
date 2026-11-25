// Keeps the first letter and the domain of each address, so a stored error or audit target never holds a full recipient.
export const maskEmails = (text: string) =>
  text.replace(/([^\s@<>"(),;:]+)@([\w-]+(?:\.[\w-]+)*)/g, (_, local: string, domain: string) => `${local[0]}***@${domain}`).slice(0, 500);
