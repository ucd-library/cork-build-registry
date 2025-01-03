# cork-build-registry
Define build dependencies between code repositories for the cork-kube build system

Contents
- [Overview](#overview)
- [Repository Definition File](#repository-definition-file)
- [Cork Build (.cork-build) Configuration File](#cork-build-configuration-file)
- [Overview of using CLI](#overview-of-using-cli)
  - [Install cork-kube CLI](#install-cork-kube-cli)
  - [List projects](#list-projects)
  - [Build a project](#build-a-project)
  - [Local Development](#local-development)

## Overview

Each file in the `repositories` directory defines; the supported versions of a project, the build dependency between two projects.   Projects are simply GitHub code repositories that have one or more Dockerfiles as well as a `.cork-build` configuration file in the root of the repository.

`Versions` of a project are defined by a git tag or branch.  The git tag/branch will be used to when tagging the build docker image.

To summarize, this registry defines; the `supported versions` of a project, the `build dependency` between two projects.  While the projects git repository defines `how` to build the project, given a specific version and build dependencies.

ℹ️ You can view an [introduction slide deck here](https://docs.google.com/presentation/d/1uq4Fu-GPu22Bf5Vw15uXI2dKOjacZ_GsMFWdBVWXVFQ)

## Repository Definition File

Each file in the `registry` directory is a JSON file that defines the build dependencies between projects.  The file should match the project name.  However the actual project name will be derived from the last part of the `repository` path.  The file contains the following fields:

- `repository` - The git repository url for the project
- `dependencies` - A list of supported versions for the project.  This should be a key/value pair oject where the key is a shortname for the repository (so you can easily reference the repository in the `builds` section) and the value is full repository url.
- `builds` - A list of supported builds for the project.  Only builds you intended to keep around in the Docker Image Registery (Google Artifact Registry for most OS projects), should be in the list.  The build object should contain a key that is the supported git tag or branch.  The value is a an object with key/value pairs of dependencies and the version of the dependency to use. 

Example 

```json
{
  "repository": "https://github.com/ucd-library/fin",

  "dependencies": {
    "init": "https://github.com/ucd-library/ucdlib-service-init"
  },

  "builds": {
    "2.8.0" : {
      "init" : "1.0.0"
    },
    "sandbox" : {
      "init" : "1.0.0"
    }
  }
}
```

Here, the fin project has two supported builds, `2.8.0` and `sandbox`.  The `2.8.0` build depends on the `1.0.0` version of the `ucdlib-service-init` project, and whatever images it projects.  The `sandbox` build also depends on the `1.0.0` version of the `ucdlib-service-init` project.

Reminder.  You don't actually say anything about how to build the fin images here.  You just define the dependencies between the projects. The actual build instructions are in the `fin` project repository.

### Using the Repository Definition File

To add a build version, simply edit the `builds` section of the repository definition file for your project adding the version and any dependencies.  Then commit the changes back to the `main` branch. 

To test changes before commit, you can
 - clone this repo
 - cd to the cork-build-registry directory
 - run `cork-kube build set-registry-location .`
 - the you can run `cork build exec --project [my-project] --version [my-new-version] --dry-run` to test the build.  Or remove the `--dry-run` to actually build the images locally.

### Wrapping source code only repositories
*Or external code repositories

There my be instances where you just want to wrap a repositories source code into a lightweight image so it can be used as a cork-build dependency in another project. This can be accomplished by adding a `type: "source-wrapper"` to the repository definition file.  There is no need to have a Dockerfile in the repository, as cork-build will auto generate a file that looks like: 

```Dockerfile
FROM alpine:latest

RUN mkdir /src
WORKDIR /src
COPY . /src
```

with the sample repository definition file looking like:

```json
{
  "repository": "https://github.com/ucd-library/my-nodejs-src",

  "dependencies": {},

  "type" : "source-wrapper",
  "registry" : "us-west1-docker.pkg.dev/digital-ucdavis-edu/pub",

  "builds": {
    "1.0.0" : {}
  }
}
```

This will generate an image for the source code named: `us-west1-docker.pkg.dev/digital-ucdavis-edu/pub/my-nodejs-src:1.0.0`

Finally, in your main projects docker file you can do the following:

```Dockerfile
ARG NODELIB_SRC_IMAGE
FROM ${NODELIB_SRC_IMAGE} as nodelib-src

FROM node:22

COPY --from=nodelib-src /src /ext-nodelib-src
RUN cd /ext-nodelib-src && npm install
# If you want to access it globally
# RUN npm install -g /ext-nodelib-src 

# ... now install your app code
```

## Cork Build (.cork-build) Configuration File

The `cork-build` configuration file is a JSON file that defines how to build the project.  The file should be in the root of the project repository (not this cork-build-registry).  The file contains the following fields:

- `registry` - The image registry to push projection images to
- `repositories` - List of project dependencies.  This should be the same structure as the `dependencies` field in the repository definition file.  The key is the shortname of the repository and the value is the full repository url.  The shortname can be used later to reference the repositories images as template variables.
- `images` - Object where the keys are the names of the images to build.  The key will be the actual name.  Each image object should define the build with the following properties:
  - `contextPath` - Required.  The context path to run the docker build command. Path should be relative to the root of the repository.
  - `dockerfile` - Optional.  The path to the Dockerfile to use.  Default is `[contextPath]/Dockerfile`.  Path should be relative to the root of the repository.
  - `options` - Optional.  Additional options to pass to the docker build command.  This should be an object with key/value pairs.  The key is the option name (without the leading `--`) and the value is the value of the option.  For example, to pass the `--build-arg` option, you would do the following:
    ```json
    {
      "options": {
        "build-arg": "MY_ARG=foo"
      }
    }
    ```
    If you need multiple options, the value should be an array of strings.  For example:
    ```json
    {
      "options": {
        "build-arg": ["MY_ARG=foo", "MY_ARG2=bar"]
      }
    }
    ```
  - `user` - Optional.  The user to leave the image as.  This is an edge case.  cork-build will append a build metadata file to `/cork-build-info/` dir.  The build process will ensure the `root` user, so if can write the file.  If you need to switch the user back after this process, specify it here. Ex. the elastic search image needs to be `elasticsearch` user.


Template Variables.  The `cork-build` configuration file can use template variables to reference the images of the dependencies.  The template variables are the shortname of the repository followed by a `.` followed by the image name.  For example, if you have a repository with the shortname `init`, you can reference the full image name with `${init.init-services}`.   

Template variables are required as we don't know which dependencies will be passed to the build script until runtime.

Example:

```json
{
  "registry" : "us-west1-docker.pkg.dev/digital-ucdavis-edu/pub",

  "repositories" : {
    "init" : "https://github.com/ucd-library/ucdlib-service-init"
  },

  "images" : {
    "fin-fcrepo" : {
      "contextPath" : "services/fcrepo"
    },
    "fin-postgres" : {
      "contextPath" : "services/postgres"
    },
    "fin-apache-lb" : {
      "contextPath" : "services/load-balancer"
    },
    "fin-base-service" : {
      "contextPath" : ".",
      "dockerfile" : "services/fin/Dockerfile"
    },
    "fin-elastic-search" : {
      "contextPath" : "services/elastic-search",
      "user" : "elasticsearch"
    },
    "fin-rabbitmq" : {
      "contextPath" : "services/rabbitmq"
    },
    "fin-init" : {
      "contextPath" : "services/init",
      "options" : {
        "build-arg" : [
          "INIT_BASE=${init.init-services}",
          "FIN_SERVER_IMAGE=${fin.fin-base-service}"
        ]
      }
    },
    "fin-pg-rest" : {
      "contextPath" : "services/pg-rest"
    }
  }
}
```

In this example, the `fin` project has 8 images to build.  The `fin-init` image depends on the `init` project.  The `fin-init` image has two build arguments that are the images of the `init` and `fin-base-service` images.  The `fin-init` image will be built with the `fin.fin-base-service` and `init.init-services` images.

If you inspect the `fin-init` Dockerfile, you will see the following:

```Dockerfile
ARG INIT_BASE
ARG FIN_SERVER_IMAGE
FROM ${FIN_SERVER_IMAGE} AS fin-server
FROM ${INIT_BASE}

```

Where the fin init image is using the passed in images as the base images.

## Overview of using CLI

### Install cork-kube CLI

```bash
npm install -g @ucd-lib/cork-kube
```

### List projects

List all projects and all versions in the registry

```bash
cork-kube build list
```

Just list projects

```bash
cork-kube build list --projects
```

Just show specific project versions

```bash
cork-kube build list --project [my-project]
```

Show all images for a project

```bash
cork-kube build list --project [my-project] --images
```

### Build a project

```bash 
cork-kube build exec --project [my-project] --version [my-version]
```

Use the `--dry-run` flag to see what will be built without actually building the images.

Or you can build production images in the cloud using 

```bash
cork-kube build gcb --project [my-project] --version [my-version]
```

### Local Development

You can register a local copy of a repository to use instead of the remote repository. 

```bash
cork-kube build register-local-repo [path-to-repo]
```

Or list your registered local repos

```bash
cork-kube build show-local-repos
```

Now these repos will ALWAYS be used instead of fresh clones from GitHub.  However, if you want to test with remote code and you have registered a local repo, you can use the `--use-remote` flag.  This is useful when building a project that has a dependency on another project that you have registered locally.  Ex: building DAMS but with a remote copy of `fin` even though you have a local copy of `fin` registered.

```bash
cork-kube build exec --project [my-project] --version [my-version] --use-remote [remote-project]
```

If you want to test updates to the `cork-build-registry` without commiting, you can set the registry location to the current directory.  First clone the `cork-build-registry` repo, then run:

```bash
cork-kube build set-registry-location [path-to-cork-build-registry]
```

Now you can test build/version changes to the registry locally without push to remote.  Just remember to set the registry location back to the original location when you are done.

```bash
cork-kube build reset-registry-location
```
