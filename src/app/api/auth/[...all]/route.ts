import { getAuth } from "@/lib/auth";

// Better Auth endpoints: /api/auth/sign-in/social, /api/auth/callback/google, /api/auth/sign-out, ...
const handle = async (req: Request) => (await getAuth()).handler(req);
export { handle as GET, handle as POST };
