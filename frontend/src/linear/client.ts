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
const NETWORK_MESSAGE = "Could not reach Linear. Check your connection and try again.";

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

function isAuthError(error: GraphqlError): boolean {
  return error.extensions?.type === "authentication error";
}

async function readBody<T>(response: Response): Promise<GraphqlBody<T> | null> {
  try {
    return (await response.json()) as GraphqlBody<T>;
  } catch {
    return null;
  }
}

export function createGraphqlClient(apiKey: string, fetchImpl: typeof fetch = fetch): GraphqlClient {
  async function send<T>(query: string, variables: Record<string, unknown>): Promise<GraphqlResult<T>> {
    let response: Response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
    } catch {
      throw new LinearError(NETWORK_MESSAGE);
    }

    const body = await readBody<T>(response);
    const errors = body?.errors ?? [];
    if (response.status === 401 || response.status === 403 || errors.some(isAuthError)) {
      throw new LinearAuthError(AUTH_MESSAGE);
    }

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
