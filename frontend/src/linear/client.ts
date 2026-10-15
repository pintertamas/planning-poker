export class LinearError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinearError";
  }
}

export class LinearAuthError extends LinearError {
  constructor(message: string) {
    super(message);
    this.name = "LinearAuthError";
  }
}

const ENDPOINT = "https://api.linear.app/graphql";
const AUTH_MESSAGE = "Linear rejected the API key. Check that it is correct and still active.";
const SIGN_IN_EXPIRED_MESSAGE = "Your Linear sign-in expired. Sign in again.";
const NETWORK_MESSAGE = "Could not reach Linear. Check your connection and try again.";

export type AuthProvider = {
  getHeader(): Promise<string | null>;
  refresh?(): Promise<boolean>;
};

export type GraphqlError = {
  message: string;
  path?: (string | number)[];
  extensions?: { type?: string; userPresentableMessage?: string };
};

export type GraphqlResult<T> = { data: T | null; errors: GraphqlError[] };

export type GraphqlClient = {
  query<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  queryPartial<T>(query: string, variables?: Record<string, unknown>): Promise<GraphqlResult<T>>;
};

type GraphqlBody<T> = { data?: T | null; errors?: GraphqlError[] };

type Attempt<T> = { response: Response; body: GraphqlBody<T> | null; errors: GraphqlError[] };

function isAuthError(error: GraphqlError): boolean {
  return error.extensions?.type === "authentication error";
}

function isAuthFailure<T>(attempt: Attempt<T>): boolean {
  return attempt.response.status === 401 || attempt.response.status === 403 || attempt.errors.some(isAuthError);
}

async function readBody<T>(response: Response): Promise<GraphqlBody<T> | null> {
  try {
    return (await response.json()) as GraphqlBody<T>;
  } catch {
    return null;
  }
}

export function createGraphqlClient(auth: string | AuthProvider, fetchImpl: typeof fetch = fetch): GraphqlClient {
  async function authorization(): Promise<string> {
    if (typeof auth === "string") return auth;
    const header = await auth.getHeader();
    if (header === null) throw new LinearAuthError(SIGN_IN_EXPIRED_MESSAGE);
    return header;
  }

  async function dispatch<T>(payload: string): Promise<Attempt<T>> {
    const header = await authorization();
    let response: Response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { Authorization: header, "Content-Type": "application/json" },
        body: payload,
      });
    } catch {
      throw new LinearError(NETWORK_MESSAGE);
    }

    const body = await readBody<T>(response);
    return { response, body, errors: body?.errors ?? [] };
  }

  async function send<T>(query: string, variables: Record<string, unknown>): Promise<GraphqlResult<T>> {
    const payload = JSON.stringify({ query, variables });
    let attempt = await dispatch<T>(payload);
    if (typeof auth !== "string" && auth.refresh && isAuthFailure(attempt)) {
      if (await auth.refresh()) {
        attempt = await dispatch<T>(payload);
      }
    }
    if (isAuthFailure(attempt)) {
      throw new LinearAuthError(typeof auth === "string" ? AUTH_MESSAGE : SIGN_IN_EXPIRED_MESSAGE);
    }

    const { response, body, errors } = attempt;
    const data = body?.data ?? null;
    if (!response.ok && data === null) {
      throw new LinearError(errors[0]?.message ?? `Linear request failed with HTTP ${response.status}.`);
    }
    return { data, errors };
  }

  return {
    async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
      const result = await send<T>(query, variables);
      const [first] = result.errors;
      if (first) throw new LinearError(first.message);
      if (result.data === null) throw new LinearError("Linear returned an empty response.");
      return result.data;
    },
    queryPartial<T>(query: string, variables: Record<string, unknown> = {}): Promise<GraphqlResult<T>> {
      return send<T>(query, variables);
    },
  };
}
