const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const axios = require("axios");
const AWS = require("aws-sdk");
const chalk = require("chalk");
const open = require("open");
const terminal = require("./terminal");

class Cmd {
  constructor(config) {
    this.config = config;
    this.config.basename = this.config.name;
    this.config.name = `${this.config.name}-${this.config.env}`;
    this.config.basecluster = this.config.cluster;
    this.config.cluster = `${this.config.cluster}-${this.config.env}`;
    this.config.role = this.config.role || "far-tasks";
  }

  async run() {
    await this.login();
    return this.execute();
  }
  
  async getCallerIdentity() {
    return new Promise(async (resolve, reject) => {
      let asCreds = {};
      if (this.config.creds) {
        try {
          let asCredsFile = path.resolve(this.config.creds);
          asCreds = JSON.parse(fs.readFileSync(asCredsFile));
        } catch(e) {
          reject(new Error(`failed to read creds file: ${e.message}`));
          return;
        }
      }

      // get the connector details from the creds file or the caprizaConfig.json if exists
      let caprizaConfig = {};
      try {
        caprizaConfig = JSON.parse(fs.readFileSync(`./resources/${this.config.env}/caprizaConfig.json`));
      } catch(e) {
        try {
          caprizaConfig = JSON.parse(fs.readFileSync("./resources/caprizaConfig.json"));
        } catch(e) {
          // ignore
        }
      }
      
      try {
        caprizaConfig = Object.assign({}, caprizaConfig, asCreds);
        if (!caprizaConfig.connectorId) {
          reject("missing connectorId in caprizaConfig.json or creds file");
          return;
        }
        if (!caprizaConfig.apiUrl) {
          reject("missing apiUrl in caprizaConfig.json or creds file");
          return;
        }
        let connectorId = caprizaConfig.connectorId;
        let adminUrl = caprizaConfig.apiUrl.replace("//api.", "//admin.").replace("/v1", "");
        
        // if we were given AS api credentials, use them to get the deployment credentials
        if (this.config.creds) {
          try {
            let creds = await axios.get(`${caprizaConfig.apiUrl}/connectors/${connectorId}/deploy-creds`, {
              headers: {
                "X-Capriza-API-Key": asCreds.apiKey,
                "X-Capriza-Secret": asCreds.secret
              }
            });
            this.handleReceivedDeployCreds(creds.data, reject, resolve);
          } catch(e) {
            reject(new Error(`failed to get deployment credentials for connectorId ${connectorId} from ${caprizaConfig.apiUrl}: ${e.message}`));
          }
        } else {
          // otherwise open the browser to interactively get the deploy credentials.
          // start a temporary server to receive the deploy credentials from the browser
          const server = http.createServer((req, res) => {
            server.close();
            if (req.headers["origin"]) {
              res.setHeader("Access-Control-Allow-Origin", req.headers["origin"]);
            }
            if (req.headers["access-control-request-headers"]) {
              res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"]);
            }
            res.end("{}");
            if (req.method === "OPTIONS") {
              return;
            }

            let body = "";
            req.on("data", data => {
              body += data.toString();
            });
            req.on("end", () => {
              if (body.length === 0) {
                let query = url.parse(req.url, true).query || {}; 
                body = query.creds && Buffer.from(query.creds, "base64");
              }
              let creds = JSON.parse(body);
              this.handleReceivedDeployCreds(creds, reject, resolve);
            });
          });

          // listen on a random available port
          server.listen(0, async () => {
            let postback = Buffer.from(JSON.stringify({port: server.address().port})).toString("base64");
            open(`${adminUrl}/connectors/${connectorId}/deploy-creds#postback=${postback}`);
          });
        }
      } catch(e) {
        reject(e);
      }
    });
  }
  
  handleReceivedDeployCreds(creds, reject, resolve) {
    if (creds.error) {
      reject(new Error(creds.error));
      return;
    }

    // merge the config we received with the local config
    this.config = Object.assign(creds.config || {}, this.config);

    let options = {
      region: this.config.region,
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken
    };

    this.sts = new AWS.STS(options);
    this.ecr = new AWS.ECR(options);
    this.ecs = new AWS.ECS(options);
    this.ec2 = new AWS.EC2(options);
    this.cwl = new AWS.CloudWatchLogs(options);
    this.sm = new AWS.SecretsManager(options);
    this.iam = new AWS.IAM(options);      
    resolve(this.sts.getCallerIdentity({}).promise());
  }

  async login() {
    let command = chalk.bold(this.config.command);
    let name = chalk.greenBright(this.config.basename);
    let env = `${chalk.blueBright(this.config.env)}${
      this.config.draft ? chalk.cyan(" (draft)") : ""
    }`;
    let prefix = `${env} • ${name} • ${command}`;
    terminal.info(prefix);
    terminal.progressStart(`logging-in...`);
    let account = await this.getCallerIdentity();
    terminal.progressEnd(`login ok (${account.Arn})`);
  }
}

module.exports = Cmd;