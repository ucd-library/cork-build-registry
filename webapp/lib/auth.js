import bodyParser from 'body-parser';
import express from 'express';
import {auth} from 'express-openid-connect';
import config from './config.js';
import model from './model.js';

const app = express();
app.use(bodyParser.json());

app.use(auth({
  issuerBaseURL: config.oidc.baseUrl,
  baseURL: config.server.url,
  clientID: config.oidc.clientId,
  clientSecret: config.oidc.secret,
  secret : config.jwt.secret,
  routes : {
    callback : '/auth/callback',
    login : '/auth/login',
    logout : '/auth/logout',
    postLogoutRedirect : '/auth/postLogoutRedirect'
  },
  authorizationParams: {
    response_type: 'code',
    scope : config.oidc.scopes
  },
  idpLogout: true
}));

app.use((req, res, next) => {
  if( !req.user ) {
    return res.status(401).json({error: "Unauthorized"});
  }

  if( req.params.project ) {
    if( !req.user.roles ) {
      return res.status(403).json({error: "Forbidden"});
    }
    if( !Array.isArray(req.user.roles) ) {
      req.user.roles = [req.user.roles];
    }
    if( !req.user.roles.includes("admin") || !req.user.roles.includes(project) ) {
      return res.status(403).json({error: "Forbidden"});
    }
  }

  req.user.username = req.user.username || req.user.prefered_username || req.user.email;

  next();
});

app.post('/api/:project', async (req, res) => {
  let {project} = req.params;
  let {repository, dependencies} = req.body;
  try {
    await model.createProjectFile(project, repository, dependencies, req.user.username);
    res.json({message: "Project created"});
  } catch(e) {
    res.status(400).json({error: e.message});
  }
});

app.post('/api/:project/dependency', async (req, res) => {
  let {project} = req.params;
  let {shortName, url} = req.body;
  try {
    await model.addDependency(project, shortName, url, req.user.username);
    res.json({message: "Dependency added"});
  } catch(e) {
    res.status(400).json({error: e.message});
  }
});

app.post('/api/:project/:version', async (req, res) => {
  let {project, version} = req.params;
  let dependencies = req.body;
  try {
    await model.addVersion(project, version, dependencies, req.user.username);
    res.json({message: "Project updated"});
  } catch(e) {
    res.status(400).json({error: e.message});
  }
});

app.put('/api/:project/:version', async (req, res) => {
  let {project, version} = req.params;
  let dependencies = req.body;
  try {
    await model.updateVersion(project, version, dependencies, req.user.username);
    res.json({message: "Project updated"});
  } catch(e) {
    res.status(400).json({error: e.message});
  }
});


app.listen(config.server.port, () => {
  console.log(`Server listening on port ${config.server.port}`);
});