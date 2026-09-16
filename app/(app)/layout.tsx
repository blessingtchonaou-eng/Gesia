import { redirect } from "next/navigation";
import { createClient } from "../../src/lib/supabase/server";
import { ensureUserExists } from "../../src/lib/user-service";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Synchroniser l'utilisateur Supabase avec le modèle Prisma User
  await ensureUserExists(user.id);

  return <>{children}</>;
}
