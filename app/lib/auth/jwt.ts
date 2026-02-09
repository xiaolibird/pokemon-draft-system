import { SignJWT, jwtVerify } from "jose";

// 获取密钥的函数，确保在运行时读取环境变量
const getSecretKey = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      // 仅在运行时且缺少密钥时抛出警告（避免构建时误报）
      if (typeof window === "undefined") {
        console.warn(
          "⚠️ WARNING: JWT_SECRET is not set in production environment variables.",
        );
      }
      return "production-fallback-secret-DO-NOT-USE";
    }
    return "dev-only-insecure-secret";
  }
  return secret;
};

export async function signToken(payload: any) {
  const key = new TextEncoder().encode(getSecretKey());
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key);
}

export async function verifyToken(token: string) {
  try {
    const key = new TextEncoder().encode(getSecretKey());
    const { payload } = await jwtVerify(token, key);
    return payload;
  } catch (error) {
    return null;
  }
}
