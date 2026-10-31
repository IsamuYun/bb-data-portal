import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "登录 · BB Data Portal" };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <LoginForm />
    </main>
  );
}
