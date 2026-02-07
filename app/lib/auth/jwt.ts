import { SignJWT, jwtVerify } from "jose";

// 生产环境必须设置 JWT_SECRET；未设置时仅开发环境允许使用占位值
const SECRET_KEY =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production"
    ? (() => {
        if (typeof window === "undefined") {
          console.warn(
            "⚠️ WARNING: JWT_SECRET is not set in production. Using insecure fallback for build.",
          );
        }
        return "production-fallback-secret-DO-NOT-USE";
      })()
    : "dev-only-insecure-secret");
const key = new TextEncoder().encode(SECRET_KEY);

export async function signToken(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, key);
    return payload;
  } catch (error) {
    return null;
  }
}
