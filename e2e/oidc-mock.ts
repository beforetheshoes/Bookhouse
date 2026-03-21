import Provider from "oidc-provider";
import http from "node:http";

const ISSUER = "http://localhost:9090";
const CLIENT_ID = "e2e-client";
const CLIENT_SECRET = "e2e-secret";
const REDIRECT_URI = "http://localhost:3000/auth/callback";

const TEST_ACCOUNT = {
  accountId: "test-user-1",
  email: "e2e@bookhouse.test",
  email_verified: true,
  name: "E2E Test User",
};

const configuration: ConstructorParameters<typeof Provider>[1] = {
  clients: [
    {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uris: [REDIRECT_URI],
      response_types: ["code"],
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: "client_secret_post",
    },
  ],
  scopes: ["openid", "profile", "email"],
  claims: {
    openid: ["sub"],
    profile: ["name"],
    email: ["email", "email_verified"],
  },
  findAccount: async (_ctx, id) => ({
    accountId: id,
    claims: async () => ({
      sub: TEST_ACCOUNT.accountId,
      email: TEST_ACCOUNT.email,
      email_verified: TEST_ACCOUNT.email_verified,
      name: TEST_ACCOUNT.name,
    }),
  }),
  features: {
    devInteractions: { enabled: false },
  },
  pkce: {
    methods: ["S256"],
    required: () => false,
  },
  cookies: {
    keys: ["e2e-cookie-key"],
  },
};

export async function startOidcMock(): Promise<http.Server> {
  const provider = new Provider(ISSUER, configuration);

  // Auto-approve all interactions (login + consent) without showing UI.
  provider.use(async (ctx, next) => {
    if (ctx.path.startsWith("/interaction/") && ctx.method === "GET") {
      const interactionDetails = await provider.interactionDetails(
        ctx.req,
        ctx.res,
      );

      const grant = new provider.Grant({
        accountId: TEST_ACCOUNT.accountId,
        clientId: interactionDetails.params.client_id as string,
      });
      grant.addOIDCScope("openid profile email");

      const grantId = await grant.save();

      await provider.interactionFinished(
        ctx.req,
        ctx.res,
        {
          login: { accountId: TEST_ACCOUNT.accountId },
          consent: { grantId },
        },
        { mergeWithLastSubmission: false },
      );
      return;
    }

    await next();
  });

  const server = http.createServer(provider.callback());

  await new Promise<void>((resolve) => {
    server.listen(9090, resolve);
  });

  return server;
}

export async function stopOidcMock(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
