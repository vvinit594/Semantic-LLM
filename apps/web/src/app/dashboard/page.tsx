import { Dashboard } from "./dashboard";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

export default function DashboardPage() {
  return <Dashboard apiUrl={apiUrl} />;
}
