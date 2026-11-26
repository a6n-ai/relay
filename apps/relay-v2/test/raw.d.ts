declare module "*.pem?raw" {
  const pem: string;
  export default pem;
}

declare module "*.sql?raw" {
  const sql: string;
  export default sql;
}
