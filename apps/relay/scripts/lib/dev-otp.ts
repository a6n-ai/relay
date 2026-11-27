// The dev-only sign-in helper. Its route is left out of the production route tree and checked absent from the bundle; the flag name is typed in src/bindings.d.ts.
export const DEV_OTP_ROUTE = "/api/dev/otp";
export const DEV_OTP_FLAG = "DEV_OTP_PEEK";
// The router matches ignore patterns against the file name only, so the route's last segment must be unique among route files.
export const DEV_OTP_FILE_PATTERN = `^${DEV_OTP_ROUTE.split("/").pop()}\\.ts$`;
