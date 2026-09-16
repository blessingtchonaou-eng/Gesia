import { createClient } from "../../../src/lib/supabase/server";
import LogoutButton from "./logout-button";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Bienvenue sur Gesia
          </h1>
          <LogoutButton />
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Utilisateur authentifié
          </h2>

          <div className="space-y-2">
            <p className="text-gray-600">
              <span className="font-medium">ID Supabase :</span>{" "}
              <span className="font-mono text-sm">{user?.id}</span>
            </p>
            <p className="text-gray-600">
              <span className="font-medium">Email :</span>{" "}
              <span className="font-mono text-sm">{user?.email}</span>
            </p>
          </div>

          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-800 font-medium">
              ✓ Profil Gesia synchronisé avec succès
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
