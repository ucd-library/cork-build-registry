import fetch from "node-fetch";
import config from "./config";

class Github {

  constructor() {
    this.UPDATE_PROPS = ["name", "content", "user", "version", "action", "sha"];
  }

  fetch(url, opts={}) {
    if( !opts.headers ) opts.headers = {};
    opts.headers['Authorization'] = `token ${config.github.accessToken}`;
    return fetch(url, opts);
  }

  async getProjectFile(name) {
    let resp = await this.fetch(`${config.github.apiBaseUrl}/repos/${config.github.registry.owner}/${config.github.registry.repo}/contents/repositories/${name}.json`);
    if( resp.status !== 200 ) throw new Error(`Failed to fetch project file: ${resp.statusText}`);
    return await resp.json();
  }

  async updateProjectFile(opts={}) {
    for( let prop of this.UPDATE_PROPS ) {
      if( !opts[prop] ) throw new Error(`Missing ${prop}`);
    }
    if( typeof opts.content === "object" ) {
      opts.content = JSON.stringify(opts.content, null, 2);
    }

    let resp = await this.fetch(
      `${config.github.apiBaseUrl}/repos/${config.github.registry.owner}/${config.github.registry.repo}/contents/repositories/${opts.name}.json`, {
      method : "PUT",
      body : JSON.stringify({
        message : `[webapp] ${opts.action} repositories/${opts.name}.json ${opts.version} for ${opts.user}`,
        content : Buffer.from(opts.content).toString("base64"),
        sha : opts.sha
      }),
      headers : {
        "Content-Type" : "application/json"
      }
    });
    if( resp.status > 299 ) throw new Error(`Failed to update project file: ${resp.statusText}`);
    return await resp.json();
  }

  async createProjectFile(name, content, user) {
    if( !user ) throw new Error("Missing user");
    if( typeof content === "object" ) content = JSON.stringify(content, null, 2);

    let resp = await this.fetch(`${config.github.apiBaseUrl}/repos/${config.github.registry.owner}/${config.github.registry.repo}/contents/repositories/${name}.json`, {
      method : "PUT",
      body : JSON.stringify({
        message : `[webapp] Created repositories/${name}.json for ${user}`,
        content : Buffer.from(content).toString("base64"),
        branch : "main"
      }),
      headers : {
        "Content-Type" : "application/json"
      }
    });
    if( resp.status > 299 ) throw new Error(`Failed to update project file: ${resp.statusText}`);
    return await resp.json();
  }

  parseJsonContent(response) {
    let content = Buffer.from(response.content, "base64").toString();
    return JSON.parse(content);
  }

}

const instance = new Github();
export default instance;