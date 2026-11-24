// Keeps the first letter and the domain of each address, so a stored error or audit target never holds a full recipient.
export const maskEmails = (text: string) => text.replace(/([\w.%+-])[\w.%+-]*@([\w-]+(?:\.[\w-]+)+)/g, "$1***@$2").slice(0, 500);
