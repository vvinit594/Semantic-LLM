import { publicApiUrl } from "@/api-url";
import { Chat } from "./chat";

const apiUrl = publicApiUrl();

export default function Home() {
  return <Chat apiUrl={apiUrl} />;
}
