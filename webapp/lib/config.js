const env = process.env;

const config = {
  url : env.URL || "http://localhost:3000",
  port : env.PORT || 3000,

  github : {
    accessToken : env.GITHUB_ACCESS_TOKEN,
    apiBaseUrl : "https://api.github.com",
    registry : {
      owner : env.GITHUB_REGISTRY_ORG || "ucd-library",
      repo : env.GITHUB_REGISTRY_REPO || "cork-build-registry",
    }
  }

}

export default config;