import { Chat } from "./chat";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

export default function Home() {
  return <Chat apiUrl={apiUrl} />;
}
