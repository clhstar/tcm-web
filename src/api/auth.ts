import { z } from "zod";
import { API_BASE_URL } from "../config/global";

export const TOKEN_STORAGE_KEY = "tcm_access_token";

const userProfileSchema = z.object({
  id: z.number(),
  username: z.string(),
  nickname: z.string(),
  role: z.string().default("USER"),
});

const authPayloadSchema = z.object({
  token: z.string(),
  tokenType: z.string(),
  expiresIn: z.number(),
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

async function requestAuth(
  path: string,
  body: LoginInput | RegisterInput,
): Promise<AuthPayload> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message ?? "Authentication failed");
  }

  return authResponseSchema.parse(payload).data;
}

async function requestRegister(body: RegisterInput): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/user/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message ?? "Registration failed");
  }

  registerResponseSchema.parse(payload);
}
