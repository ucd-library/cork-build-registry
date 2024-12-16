import fs from 'fs';
const env = process.env;

let privateKey = env.GITHUB_PRIVATE_KEY;
if( env.GITHUB_PRIVATE_KEY_FILE ) {
  privateKey = fs.readFileSync(env.GITHUB_PRIVATE_KEY_FILE).toString();
}

const config = {
  url : env.URL || "http://localhost:3000",
  port : env.PORT || 3000,

  github : {
    apiBaseUrl : "https://api.github.com",
    registry : {
      owner : env.GITHUB_REGISTRY_ORG || "ucd-library",
      repo : env.GITHUB_REGISTRY_REPO || "cork-build-registry",
    },
    app : {
      id : env.GITHUB_APP_ID,
      installationId : env.GITHUB_APP_INSTALLATION_ID,
      privateKey,
    }
  },

  // Keycloak configuration
  oidc : {
    tokenCacheTTL : env.OIDC_TOKEN_CACHE_TTL || 1000*60*5,
    baseUrl : env.OIDC_BASE_URL || 'https://auth.library.ucdavis.edu/realms/pg-farm',
    clientId : env.OIDC_CLIENT_ID || '',
    secret : env.OIDC_SECRET || '',
    scopes : env.OIDC_SCOPES || 'roles openid profile email',
    roleIgnoreList : []
  }

}

export default config;