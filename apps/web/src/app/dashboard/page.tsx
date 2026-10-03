import { publicApiUrl } from "@/api-url";
import { Dashboard } from "./dashboard";

const apiUrl = publicApiUrl();

export default function DashboardPage() {
  return <Dashboard apiUrl={apiUrl} />;
}
