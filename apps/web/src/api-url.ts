export function publicApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";
}
