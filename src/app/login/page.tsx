import AuthLayout from "@/components/auth/AuthLayout";
import LoginForm from "@/components/auth/LoginForm";

// Server component so the page arrives fully rendered, with the error from the
// e-mail link (if any) already in the HTML.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const raw = params?.error;
  const linkError = Array.isArray(raw) ? raw[0] : raw;

  return (
    <AuthLayout>
      <LoginForm linkError={linkError} />
    </AuthLayout>
  );
}
