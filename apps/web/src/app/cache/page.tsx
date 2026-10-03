import { publicApiUrl } from "@/api-url";
import { CacheExplorer } from "./explorer";

const apiUrl = publicApiUrl();

export default function CachePage() {
  return <CacheExplorer apiUrl={apiUrl} />;
}
