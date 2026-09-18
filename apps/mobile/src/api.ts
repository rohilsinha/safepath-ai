const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export interface SignupRequest {
  name: string;
  email: string;
  password: string;
}

export interface SignupResponse {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface CurrentUserResponse {
  id: string;
  name: string;
  email: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function signup(data: SignupRequest): Promise<SignupResponse> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error('Unable to connect to SafePath. Check your connection and try again.');
  }

  let responseBody: { message?: string | string[] } | undefined;
  try {
    responseBody = (await response.json()) as { message?: string | string[] };
  } catch {
    responseBody = undefined;
  }

  if (!response.ok) {
    const message = Array.isArray(responseBody?.message)
      ? responseBody.message.join(', ')
      : responseBody?.message ?? 'Unable to create your account. Please try again.';
    throw new ApiError(response.status, message);
  }

  return responseBody as SignupResponse;
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error('Unable to connect to SafePath. Check your connection and try again.');
  }

  let responseBody: { message?: string | string[] } | LoginResponse | undefined;
  try {
    responseBody = (await response.json()) as
      | { message?: string | string[] }
      | LoginResponse;
  } catch {
    responseBody = undefined;
  }

  if (!response.ok) {
    const errorBody = responseBody as { message?: string | string[] } | undefined;
    const message = Array.isArray(errorBody?.message)
      ? errorBody.message.join(', ')
      : errorBody?.message ?? 'Unable to sign in. Please try again.';
    throw new ApiError(response.status, message);
  }

  return responseBody as LoginResponse;
}

export async function getCurrentUser(
  accessToken: string,
): Promise<CurrentUserResponse> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error('Unable to connect to SafePath. Check your connection and try again.');
  }

  let responseBody: { message?: string | string[] } | CurrentUserResponse | undefined;
  try {
    responseBody = (await response.json()) as
      | { message?: string | string[] }
      | CurrentUserResponse;
  } catch {
    responseBody = undefined;
  }

  if (!response.ok) {
    const errorBody = responseBody as { message?: string | string[] } | undefined;
    const message = Array.isArray(errorBody?.message)
      ? errorBody.message.join(', ')
      : errorBody?.message ?? 'Unable to restore your session. Please sign in again.';
    throw new ApiError(response.status, message);
  }

  return responseBody as CurrentUserResponse;
}
