import { SessionRoute } from '@/features/session/SessionRoute';

type SessionPageProps = {
  params: Promise<{ token: string }>;
};

export default async function SessionPage({ params }: SessionPageProps) {
  const { token } = await params;

  return <SessionRoute token={token} />;
}
