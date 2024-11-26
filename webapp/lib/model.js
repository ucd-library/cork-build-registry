import github from "./github.js";

class RepoUpdateModel {

  async createProjectFile(shortName, repository, dependencies={}, user) {
    if( !repository ) throw new Error("Missing repository");    
    if( !user ) throw new Error("Missing user");

    try {
      new URL(repository); // validate URL
    } catch(e) {
      throw new Error("Invalid repository URL");
    }

    let shortName = repository.split("/").pop().replace(/\.git$/, "");

    let projectFile;
    try {
      projectFile = await github.getProjectFile(shortName);
    } catch(e) {}
    if( projectFile ) throw new Error("Project already exists");

    let content = {
      repository : repository,
      dependencies : dependencies
    };

    await github.updateProjectFile({
      name: shortName, 
      content: JSON.stringify(content, null, 2), 
      sha : null, 
      user, 
      version: shortName, 
      action: "creating repository"
    });
  }

  async addDependency(projectName, shortName, url, user) {
    if( !projectName ) throw new Error("Missing project name");
    if( !shortName ) throw new Error("Missing dependency short name");
    if( !url ) throw new Error("Missing dependency URL");
    if( !user ) throw new Error("Missing user");

    let project = await github.getProjectFile(projectName);
    let sha = project.sha;
    project = github.parseJsonContent(project);

    try {
      new URL(url); // validate URL
    } catch(e) {
      throw new Error("Invalid repository URL");
    }

    if( !project.dependencies ) project.dependencies = {};
    project.dependencies[shortName] = url;

    project.repository = url;
    await github.updateProjectFile({
      name: shortName, 
      content: project, 
      sha, 
      user, 
      action: "adding dependency",
      version: url
    });
  }

  async addVersion(projectName, newVersion, dependencies={}, user) {
    let project = await github.getProjectFile(projectName);
    let sha = project.sha;
    project = github.parseJsonContent(project);

    if( !project.options ) {
      project.options = {};
    }
    if( !project.builds ) {
      project.builds = {};
    }
    
    if( project.builds[project.version] ) {
      throw new Error("Cannot add version, already exists: " + newVersion);
    }

    project.builds[newVersion] = dependencies;

    await github.updateProjectFile({
      name: projectName, 
      content: project, 
      sha, 
      user, 
      action: "adding version",
      version: newVersion
    });
  }

  async updateVersion(projectName, newVersion, dependencies={}, user) {
    let project = await github.getProjectFile(projectName);
    let sha = project.sha;
    project = github.parseJsonContent(project);

    if( !project.options ) {
      project.options = {};
    }
    if( !project.builds ) {
      project.builds = {};
    }

    if( project.options.immutableVersions ) {
      throw new Error("Cannot update version, immutable versions enabled");
    }

    if( !project.builds[project.version] ) {
      throw new Error("Cannot update version, does not exist: " + newVersion);
    }

    project.builds[project.version] = dependencies;

    await github.updateProjectFile({
      name: projectName, 
      content: project, 
      sha, 
      user, 
      action: "updating version",
      version: newVersion
    });
  }

}

const instance = new RepoUpdateModel();
export default instance;