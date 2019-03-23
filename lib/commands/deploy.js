const readline = require("readline");
const path = require("path");
const fs = require("fs");
const util = require("util");
const zlib = require("zlib");
const fsopen = util.promisify(fs.open);
const fsclose = util.promisify(fs.close);
const readFile = util.promisify(fs.readFile);
const Docker = require("dockerode");
const tar = require("tar-fs");
const Cmd = require("../cmd");
const terminal = require("../terminal");

class DeployCmd extends Cmd {
  constructor(config) {
    super(config);
  }

  async execute() {
    this._normalizeSecrets();
    await this._setDockerRepoCredentials();
    let data = await this._buildDocker();
    await this._pushDocker(data);
    await this._updateService(data.repoTagname);
  }

  async _setDockerRepoCredentials() {
    let authData = await this.ecr.getAuthorizationToken().promise();
    let token = authData.authorizationData[0].authorizationToken;
    let [username, password] = Buffer.from(token, "base64")
      .toString()
      .split(":");
    this.authconfig = { username, password };
  }

  _normalizeSecrets() {
    if (this.config.secrets) {
      // normalize to array
      if (typeof this.config.secrets === "string") {
        this.config.secrets = [this.config.secrets];
      } else if (typeof this.config.secrets === "object" && !Array.isArray(this.config.secrets)) {
        this.config.secrets = Object.keys(this.config.secrets).map(s => {
          return { [s]: this.config.secrets[s] };
        });
      }
    }
  }

  async _uploadSecrets() {
    if (this.config.secrets) {
      terminal.progressStart("Updating service secrets");
      for (let i = 0; i < this.config.secrets.length; ++i) {
        let secret = this.config.secrets[i];
        let source = secret;
        if (typeof secret === "object") {
          let obj = secret;
          secret = Object.keys(obj)[0];
          source = obj[secret];
        }

        let secretId = `${this.config.name}/${secret}`;
        let value = await readFile(path.resolve(source), "utf8");
        try {
          // create the secret
          await this.sm
            .createSecret({
              Name: secretId,
              SecretString: value
            })
            .promise();
        } catch (e) {
          if (e.code === "InvalidRequestException") {
            // the secret could be deleted
            let data = await this.sm
              .describeSecret({
                SecretId: secretId
              })
              .promise();
            if (data.DeletedDate) {
              // restore the secret
              await this.sm
                .restoreSecret({
                  SecretId: secretId
                })
                .promise();
            } else {
              // it's not deleted, something else is wrong
              throw e;
            }
          } else if (e.code !== "ResourceExistsException") {
            // anything but "already exists" is an error
            throw e;
          }
          // update the secret value
          await this.sm
            .putSecretValue({
              SecretId: secretId,
              SecretString: value
            })
            .promise();
        }
      }
      terminal.progressEnd();
    }
  }

  async _updateService(image) {
    this._normalizeSecrets();
    let cluster = await this._ensureCluster();
    if (cluster.status !== "ACTIVE") {
      throw new Error(`cluster ${cluster.clusterName} is ${cluster.status}`);
    }
    await this._uploadSecrets();
    await this._normalizeSecurityGroups();
    let taskDefinition = await this._registerTaskDefinition(image);
    await this._ensureService(taskDefinition);
  }

  async _normalizeSecurityGroups() {
    if (
      this.config.securityGroups &&
      Array.isArray(this.config.securityGroups) &&
      this.config.securityGroups.length > 0
    ) {
      return;
    }

    terminal.progressStart("Looking up security groups with tag:farSecurityGroup=true");
    let result = await this.ec2
      .describeSecurityGroups({
        Filters: [
          {
            Name: "tag:farSecurityGroup",
            Values: ["true"]
          }
        ]
      })
      .promise();
    if (result.SecurityGroups.length === 0) {
      terminal.progressInfo("No security groups with tag:farSecurityGroup=true found");
      return;
    }

    terminal.progressEnd();
    this.config.securityGroups = result.SecurityGroups.map(s => s.GroupId);
    terminal.info(`Using security groups: ${this.config.securityGroups}`);
  }

  async _pushDocker(data) {
    return new Promise(async (resolve, reject) => {
      let docker = new Docker();
      let image = await docker.getImage(data.repo.repositoryUri);
      terminal.info(`Pushing ${data.repoTagname}`);
      let response = await image.push({ tag: data.tagvalue, authconfig: this.authconfig });

      // track any newlines entered in the terminal by the user
      // to increase the distance delta
      let distanceDelta = 1;
      let distanceDeltaRl = readline.createInterface({
        input: process.stdin
      });
      distanceDeltaRl.on("line", () => ++distanceDelta);

      // print push progress to the same line
      let rl = readline.createInterface({
        input: response
      });

      let distances = [];
      let error;
      rl.on("line", line => {
        line = JSON.parse(line);
        if (line) {
          if (line.error) {
            error = line.error;
          } else {
            let distance;
            if (line.id) {
              // position the console cursor at the right line
              distance = distances.indexOf(line.id);
              if (distance === -1) {
                distances.unshift(line.id);
              } else {
                readline.cursorTo(process.stdout, 0); // begining of line
                readline.moveCursor(process.stdout, 0, -1 * (distance + distanceDelta)); // up to the correct line
                readline.clearLine(process.stdout, 0); // clear the line
              }
              process.stdout.write(`  ${line.id}:`);
            }
            if (line.status) {
              process.stdout.write(`  ${line.status}`);
            }
            if (line.progress) {
              process.stdout.write(` ${line.progress}`);
            }
            if (line.status) {
              process.stdout.write("\n");
            }
            if (distance !== -1) {
              // position the console cursor at the bottom again
              readline.cursorTo(process.stdout, 0);
              readline.moveCursor(process.stdout, 0, distance + distanceDelta);
            }
          }
        }
      });
      rl.on("close", () => {
        distanceDeltaRl.close();
        if (!error) {
          resolve();
        } else {
          reject(new Error(`failed to push docker image: ${error}`));
        }
      });
    });
  }

  async _buildDocker() {
    return new Promise(async (resolve, reject) => {
      let built = false;
      let tagged = false;
      let repo = await this._getRepository(true);
      let repoUri = repo.repositoryUri;
      let tagvalue = this.config.tag;
      if (!tagvalue) {
        try {
          // if we have a package.json, get the tag value as the version
          tagvalue = require(path.resolve(process.cwd(), "package.json")).version;
        } catch (e) {
          // ignore
        }
        if (!tagvalue) {
          return reject(new Error(`missing tag value`));
        }
      }

      // add timestamp if this is a draft
      if (this.config.draft) {
        let datetag = new Date().toISOString().replace(/[-:T]|([.][0-9]+Z)/g, "");
        tagvalue = `${tagvalue}-${datetag}`;
      }

      let repoTagname = `${repoUri}:${tagvalue}`;
      // check if the image tag already exists
      try {
        let result = await this.ecr
          .describeImages({
            repositoryName: this.config.name,
            imageIds: [{ imageTag: tagvalue }]
          })
          .promise();
        if (result.imageDetails.length > 0) {
          return reject(new Error(`image ${repoTagname} already exists in the remote repository`));
        }
      } catch (e) {
        // ignore
      }

      // try to open the dockerfile for reading
      let dockerfile = this.config.dockerfile || "Dockerfile";
      try {
        let fd = await fsopen(path.resolve(dockerfile), "r");
        await fsclose(fd);
      } catch (e) {
        return reject(new Error(`${dockerfile} does not exist`));
      }

      let docker = new Docker();
      try {
        terminal.info(`Building docker image from ${dockerfile}`);

        // list of files/directories to ignore.
        // ignore secrets by default
        let ignore = (this.config.secrets || []).map(secret => {
          if (typeof secret === "object") {
            secret = Object.values(secret)[0];
          }
          return secret;
        });
        try {
          let dockerignore = await readFile(".dockerignore", "utf8");
          ignore = ignore.concat(dockerignore.split("\n").map(e => e.trim()));
        } catch (e) {
          // .dockerignore does not exist
        }

        // create the tar stream
        ignore = ignore.map(i => path.resolve(i));
        let pack = tar.pack(".", {
          ignore: name => {
            let ignored = ignore.indexOf(path.resolve(name)) !== -1;
            if (ignored) {
              terminal.info(`Excluding ${name} from build context`);
            }
            return ignored;
          }
        });

        let dockerBuildOpts = this.config.dockerBuild || {};
        dockerBuildOpts.t = repoTagname;

        // kickoff the build
        let response = await docker.buildImage(pack.pipe(zlib.createGzip()), dockerBuildOpts);

        let rl = readline.createInterface({
          input: response
        });

        let error;
        rl.on("line", line => {
          line = JSON.parse(line);
          if (line.error) {
            error = line.error;
          } else {
            line = line.stream;
            if (line) {
              if (line.startsWith("Successfully built")) {
                built = true;
              }
              if (line.startsWith("Successfully tagged")) {
                tagged = true;
              }
              process.stdout.write(`  ${line}`);
            }
          }
        });
        rl.on("close", () => {
          if (built && tagged) {
            resolve({ repoTagname, repo, tagvalue });
          } else {
            reject(new Error(`failed to build docker image: ${error}`));
          }
        });
      } catch (e) {
        reject(new Error(`failed to build docker image: ${e.message}`));
      }
    });
  }

  async _registerTaskDefinition(image) {
    let envs = [
      { name: "AWS_REGION", value: this.config.region },
      { name: "AWS_CLUSTER", value: this.config.cluster },
      { name: "MS_NAME", value: this.config.name }
    ];

    if (this.config.variables) {
      for (let i = 0; i < this.config.variables.length; ++i) {
        try {
          let [full, name, value] = this.config.variables[i].match(/^([^=]+)=(.*)$/);
          envs.push({ name: name, value: value });
        } catch (e) {
          throw new Error(`environment variable "${this.config.variables[i]}" is not a valid format`);
        }
      }
    }
    terminal.info(`Environment variables for task definition: ${envs.map(e => e.name)}`);

    let ports = [];
    if (this.config.ports && this.config.ports.length > 0) {
      if (!this.config.securityGroups) {
        throw new Error(`cannot expose container ports without specifying a security group`);
      }
      terminal.log(`Exposing ports ${this.config.ports}`);
      for (let i = 0; i < this.config.ports.length; ++i) {
        let [containerPort, hostPort] = `${this.config.ports[i]}`.split(":");
        ports[i] = {
          containerPort: containerPort,
          hostPort: hostPort || containerPort
        };
      }
    }

    terminal.progressStart(`Setting up CloudWatchLogs`);
    // create the log group
    let logGroupName = `awslogs-far-${this.config.name}`;
    let filterName = `${logGroupName}-filter`;
    try {
      await this.cwl
        .createLogGroup({
          logGroupName: logGroupName
        })
        .promise();
    } catch (e) {
      if (e.code !== "ResourceAlreadyExistsException") {
        throw e;
      }
    }

    // set log retention policy
    await this.cwl
      .putRetentionPolicy({
        logGroupName: logGroupName,
        retentionInDays: this.config.logRetention !== undefined ? this.config.logRetention : 90
      })
      .promise();

    // check if there is a global setting for sending cloud watch logs
    let logDestination =
      this.config.logDestination !== undefined ? this.config.logDestination : this.awsConfig.far_log_destination;
    if (logDestination) {
      // check if subscription filter already exists
      let result = await this.cwl
        .describeSubscriptionFilters({
          logGroupName: logGroupName
        })
        .promise();

      if (result.subscriptionFilters.length > 0) {
        terminal.progressEnd();
        let subs = result.subscriptionFilters[0];
        terminal.progressStart(`Deleting existing CloudWatchLogs destination ${subs.destinationArn} (${subs.filterName})`);
        await this.cwl
          .deleteSubscriptionFilter({
            logGroupName: logGroupName,
            filterName: subs.filterName
          })
          .promise();
      }

      logDestination = logDestination.replace("*", this.config.region);
        await this.cwl
          .putSubscriptionFilter({
            logGroupName: logGroupName,
            filterName: filterName,
            filterPattern: "",
            destinationArn: logDestination,
            distribution: "ByLogStream"
          })
          .promise();
        terminal.progressEnd();
        terminal.info(`CloudWatchLogs destination: ${logDestination}`);
    }

    terminal.progressStart(`Registering task definition ${this.config.name}`);
    if (!image) {
      if (this.config.repository) {
        if (!this.config.tag) {
          throw new Error(`image repository specified but missing the tag value`);
        }
        image = `${this.config.repository}:${this.config.tag}`;
      } else {
        let result = await this.ecs
          .describeTaskDefinition({
            taskDefinition: this.config.name
          })
          .promise();
        image = result.taskDefinition.containerDefinitions[0].image;
      }
    }

    // register the task definition
    let logOptions = {
      "awslogs-region": this.config.region,
      "awslogs-group": `awslogs-far-${this.config.name}`,
      "awslogs-stream-prefix": `awslogs-${this.config.name}`
    };
    if (this.config.logDatetimeFormat) {
      logOptions["awslogs-datetime-format"] = this.config.logDatetimeFormat;
    }

    let result = await this.ecs
      .registerTaskDefinition({
        containerDefinitions: [
          {
            name: this.config.name,
            essential: true,
            image: image,
            memoryReservation: 128,
            environment: envs,
            portMappings: ports,
            logConfiguration: {
              logDriver: "awslogs",
              options: logOptions
            }
          }
        ],
        networkMode: this.config.type === "fargate" ? "awsvpc" : "bridge",
        requiresCompatibilities: [this.config.type.toUpperCase()],
        cpu: `${this.config.cpu}`,
        memory: `${this.config.memory}`,
        family: this.config.name,
        taskRoleArn: this.config.role,
        executionRoleArn: this.config.type === "fargate" ? "ecsTaskExecutionRole" : undefined
      })
      .promise();
    terminal.progressEnd();
    return result.taskDefinition;
  }

  async _ensureEcsTaskExecutionRole() {
    try {
      terminal.progressStart(`Ensuring role ecsTaskExecutionRole`);
      await this.iam
        .createRole({
          RoleName: "ecsTaskExecutionRole",
          Description:
            "Allows ECS task execution to pull container images from Amazon ECR or to use the awslogs log driver",
          AssumeRolePolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "",
                Effect: "Allow",
                Principal: {
                  Service: "ecs-tasks.amazonaws.com"
                },
                Action: "sts:AssumeRole"
              }
            ]
          })
        })
        .promise();
    } catch (e) {
      if (e.code !== "EntityAlreadyExists") {
        throw e;
      }
    }

    await this.iam
      .attachRolePolicy({
        PolicyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
        RoleName: "ecsTaskExecutionRole"
      })
      .promise();
    terminal.progressEnd();
  }

  async _ensureFarTaskRole() {
    if (this.config.role !== "far-tasks") {
      return;
    }

    try {
      terminal.progressStart(`Ensuring role ${this.config.role}`);
      await this.iam
        .createRole({
          RoleName: this.config.role,
          Description: "Allows ECS tasks launched by far to read secrets from AWS Secrets Manager",
          AssumeRolePolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "",
                Effect: "Allow",
                Principal: {
                  Service: "ecs-tasks.amazonaws.com"
                },
                Action: "sts:AssumeRole"
              }
            ]
          })
        })
        .promise();
    } catch (e) {
      if (e.code !== "EntityAlreadyExists") {
        throw e;
      }
    }

    await this.iam
      .attachRolePolicy({
        PolicyArn: "arn:aws:iam::aws:policy/SecretsManagerReadWrite",
        RoleName: this.config.role
      })
      .promise();
    terminal.progressEnd();
  }

  async _ensureService(taskDefinition) {
    await this._ensureEcsTaskExecutionRole();
    await this._ensureFarTaskRole();
    let subnets = await this._getExplicitSubnets();
    if (!subnets || subnets.length === 0) {
      // no expicit subnets specified, look for tagged subnets
      subnets = await this._getTaggedSubnets();
    }
    terminal.info(`Service subnets: ${subnets}`);
    let taskDef = `${taskDefinition.family}:${taskDefinition.revision}`;
    terminal.progressStart("Preparing for service update");
    let result = await this.ecs
      .describeServices({
        services: [this.config.name],
        cluster: this.config.cluster
      })
      .promise();
    terminal.progressEnd();

    let assignPublicIp =
      this.config.assignPublicIp === true || this.config.subnets === "awsDefaultVpc" ? "ENABLED" : "DISABLED";
    terminal.info(`Public IP: ${assignPublicIp}`);

    let params = {
      cluster: this.config.cluster,
      desiredCount: this.config.count !== undefined ? this.config.count : 1,
      taskDefinition: taskDef,
      networkConfiguration:
        this.config.type === "fargate"
          ? {
              awsvpcConfiguration: {
                subnets: subnets,
                securityGroups: this.config.securityGroups,
                assignPublicIp: assignPublicIp
              }
            }
          : undefined
    };

    if (result.services.length === 0 || result.services[0].status !== "ACTIVE") {
      // no service
      terminal.progressStart(`Creating service ${this.config.name}`);
      params.serviceName = this.config.name;
      params.launchType = this.config.type.toUpperCase();
      result = await this.ecs.createService(params).promise();
    } else {
      // service exists, update it
      terminal.progressStart(`Updating service ${this.config.name} to use ${taskDef}`);
      params.service = this.config.name;
      result = await this.ecs.updateService(params).promise();
    }
    terminal.progressEnd();
    return result.service;
  }

  async _getExplicitSubnets() {
    if (this.config.subnets && Array.isArray(this.config.subnets) && this.config.subnets.length > 0) {
      return this.config.subnets;
    }

    if (this.config.subnets === "awsDefaultVpc") {
      terminal.progressStart("Retrieving default VPC subnets");
      result = await this.ec2.describeSubnets().promise();
      let subnets = result.Subnets.filter(s => s.DefaultForAz && s.State === "available");
      terminal.progressEnd();
      return subnets.map(s => s.SubnetId);
    }
  }

  async _getTaggedSubnets() {
    terminal.progressStart("Looking for subnets with tag:farSubnet=true");
    let result = await this.ec2
      .describeSubnets({
        Filters: [
          {
            Name: "tag:farSubnet",
            Values: ["true"]
          }
        ]
      })
      .promise();
    if (result.Subnets.length > 0) {
      terminal.progressEnd();
      return result.Subnets.map(s => s.SubnetId);
    }
    terminal.progressInfo("No subnets found with tag:farSubnet=true");
  }

  async _ensureCluster() {
    let result = await this.ecs
      .describeClusters({
        clusters: [this.config.cluster]
      })
      .promise();
    if (result.clusters.length > 0) {
      return result.clusters[0];
    }
    terminal.progressStart(`Creating cluster ${this.config.cluster}`);
    result = await this.ecs
      .createCluster({
        clusterName: this.config.cluster
      })
      .promise();
    terminal.progressEnd();
    return result.cluster;
  }

  async _getRepository(create) {
    if (this.config.repository && this.config.repository.length > 0) {
      return this.config.repository;
    }

    try {
      let result = await this.ecr
        .describeRepositories({
          repositoryNames: [this.config.name]
        })
        .promise();
      return result.repositories[0];
    } catch (e) {
      if (e.code === "RepositoryNotFoundException" && create) {
        terminal.progressStart(`Creating repository for ${this.config.name}`);
        let result = await this.ecr
          .createRepository({
            repositoryName: this.config.name
          })
          .promise();
        terminal.progressEnd();
        return result.repository;
      }
      throw e;
    }
  }
}

module.exports = DeployCmd;
