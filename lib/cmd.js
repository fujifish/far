const AWS = require("aws-sdk");

class Cmd {
  constructor(config) {
    this.config = config;
    this.config.basename = this.config.name;
    this.config.name = `${this.config.name}-${this.config.env}`;
    this.config.basecluster = this.config.cluster;
    this.config.cluster = `${this.config.cluster}-${this.config.env}`;

    this.ecr = new AWS.ECR({
      region: this.config.region
    });

    this.ecs = new AWS.ECS({
      region: this.config.region
    });

    this.ec2 = new AWS.EC2({
      region: this.config.region
    });

    this.cwl = new AWS.CloudWatchLogs({
      region: this.config.region
    });

    this.sm = new AWS.SecretsManager({
      region: this.config.region
    });
  }

  async _setDockerRepoCredentials() {
    let authData = await this.ecr.getAuthorizationToken().promise();
    let token = authData.authorizationData[0].authorizationToken;
    let [username, password] = Buffer.from(token, "base64")
      .toString()
      .split(":");
    this.authconfig = { username, password };
  }
}

module.exports = Cmd;