import { z } from "zod";
import { requestJson } from "../shared/api/httpClient";
import { readRefreshToken } from "../shared/auth/sessionStorage";
export { TOKEN_STORAGE_KEY } from "../shared/auth/sessionStorage";

const userProfileSchema = z.object({
  id: z.number(),
  username: z.string(),
  nickname: z.string(),
  role: z.string().default("USER"),
});

export const authPayloadSchema = z.object({
  token: z.string(),
  tokenType: z.string(),
  expiresIn: z.number(),
  refreshToken: z.string().optional(),
  refreshExpiresIn: z.number().optional(),
  user: userProfileSchema,
});

const authResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: authPayloadSchema,
});

const registerResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: userProfileSchema,
});

export type AuthPayload = z.infer<typeof authPayloadSchema>;

type LoginInput = {
  username: string;
  password: string;
};

type RegisterInput = LoginInput & {
  nickname: string;
};

export async function login(input: LoginInput): Promise<AuthPayload> {
  return requestAuth("/api/user/login", input);
}

export async function register(input: RegisterInput): Promise<AuthPayload> {
  await requestRegister(input);
  return login({
    username: input.username,
    password: input.password,
  });
}

export async function refreshSession(): Promise<AuthPayload> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) {
    throw new Error("Refresh token is unavailable");
  }

  const payload = await requestJson("/api/user/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  }, {
    authenticated: false,
    fallbackMessage: "Session refresh failed",
  });

  return authResponseSchema.parse(payload).data;
}

async function requestAuth(
  path: string,
  body: LoginInput | RegisterInput,
): Promise<AuthPayload> {
  const payload = await requestJson(path, {
    method: "POST",
    body: JSON.stringify(body),
  }, {
    authenticated: false,
    fallbackMessage: "Authentication failed",
  });

  return authResponseSchema.parse(payload).data;
}

async function requestRegister(body: RegisterInput): Promise<void> {
  const payload = await requestJson("/api/user/register", {
    method: "POST",
    body: JSON.stringify(body),
  }, {
    authenticated: false,
    fallbackMessage: "Registration failed",
  });

  registerResponseSchema.parse(payload);
}
