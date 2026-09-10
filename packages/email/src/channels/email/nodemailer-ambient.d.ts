// @types/nodemailer is a devDependency here but not always resolvable from a
// consuming app's typecheck (packages ship raw .ts, so consumers typecheck
// this file directly without this package's own devDependency tree hoisted).
// Both dynamic imports below only need "some object with the method we call",
// so an ambient any-shaped module is simpler than depending on the real types
// being resolvable everywhere this file is consumed from.
declare module "nodemailer";
declare module "nodemailer/lib/mail-composer/index.js";
