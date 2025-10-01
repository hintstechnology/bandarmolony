import { Layout } from "./components/Layout";
import { ProfilePage } from "./components/ProfilePage";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  return (
    <Layout currentPage="profile">
      <ProfilePage />
      <Toaster />
    </Layout>
  );
}