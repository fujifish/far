# far

`far` is a CLI for deploying a docker container to AWS Fargate/ECS and running it as a service. 
`far` automates the process of building the docker image, setting up the AWS cluster, defining the service and creating task definitions. 
All that is required are AWS account credentials with sufficient privileges.

## Installation

```bash
npm install -g @capriza/far
```

## Getting Started

Assume a project directory named `my-project` with a Dockerfile you want to deploy to region `eu-west-1` of AWS.

#### Prerequesits:

* AWS account
* Docker installed and running. Get Docker from [here](https://docs.docker.com/install/)

### AWS Credentials

`far` works with AWS so you must have an AWS account setup and a locally configured named profile with the access credentials defined in the 
`$HOME/.aws/credentials` file. If the named profile does not yet exist, you will be asked to add it when running `far init`.
See [Named Profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-multiple-profiles.html) for more information on the AWS credentials and profiles. 

### Initialize

Change into the `my-project` directory and run `far init` to create and initialize a farconfig file for the `test` environment.

```bash
$ cd my-project
$ far init
Environment: test
Service name ["my-project"]:
AWS Cluster name ["my-project"]:
AWS region ["eu-west-1"]:
AWS credentials profile ["default"]:
Wrote configuration to farconfig.test
```

### Deploy

Run the `far deploy` command to build your docker image, deploy it to AWS and run it as a service.

```bash
$ far deploy
Environment: test
Building docker image from Dockerfile
<... OMITTED ...>
Creating cluster my-project-test... Done.
Updating service secrets.... Done.
Environment variables for task definition: AWS_REGION,AWS_CLUSTER,MS_NAME
Registering task definition my-project-test..... Done.
Creating service my-project-test with subnets subnet-481a9200,subnet-4d0ef417,subnet-8af74cec.... Done.
```

At this point your docker image is running as a service named `my-project-test` on AWS fargate.

### View Logs

Run the `far logs` command to view and follow the logs of our service. Logs are everything that's printed to the console by your docker image.

```bash
$ far logs
log line 1...
log line 2...
log line 3...
```

## Usage

```
far <command> [options]
```

far requires that a `farconfig.<env>` file exists in the working directory where far is executed (except for `far init`). `env` denotes the environment of the deployment, examples of which include "test" and "prod". If not specified, `env` defaults to `test`.

far operates in the cotext of the current working directory, so it's necessary to cd into the directory containing the farconfig file and to execute the `far` command from within the directory.

### Commands

To see the list of available commands run `far help`. To see help and available options for a specific command run `far <command> help`.

```bash
$ far help
far <command>

Commands:
  far init           initialize a new far configuration file in the current directory
  far deploy         deploy the local docker image and run it as a service
  far update         update an existing service (cpu, memory, secrets, etc.) without deploying a new docker image
  far scale <count>  scale up or down the number of instances running in the service (0 will stop the service)
  far stop           stop all container instances running in the service (same as 'far scale 0')
  far status         view service status information
  far logs           view all container instances logs in the service
  far terminate      terminate the environment and all its resources

Options:
  --help     Show help                                                                                         [boolean]
  --version  Show version number                                                                               [boolean]
  --env      configuration file environment (e.g. specifying "prod" will load "farconfig.prod")
  --name     service name
  --region   aws region
  --cluster  aws cluster name
  --profile  aws credentials profile name from default AWS credentials file
```

#### Common Options

* `env` - the environment of deployment. defaults to `test`.
* `name` - the name of the service. default is the current working directory name.
* `region` - the AWS region where the service is deployed.
* `cluster` - the name if the AWS cluster where the service is deployed.
* `type` - the type of cluster (fargate or ec2). default is fargate.
* `profile` - the name of the AWS credentials profile to use for authenticating with AWS. See [Named Profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-multiple-profiles.html) for more information.

#### `init`

```bash
$ far init help
far init

initialize a new far configuration file in the current directory

Options:
  --help     Show help                                                                                         [boolean]
  --version  Show version number                                                                               [boolean]
  --env      configuration file environment (e.g. specifying "prod" will load "farconfig.prod")
  --name     service name
  --region   aws region
  --cluster  aws cluster name
  --profile  aws credentials profile name from default AWS credentials file
```

#### `deploy`

When deploying, the image is tagged with value of the `tag` option. If the tag option is not provided,
an attempt is made to use the `version` value from a local package.json. 
If the tag already exists in the remote AWS respository then the deploy fails.

If `draft` is set to `true` then the image tag is suffixed with the current timsestamp so that every time a deploy is executed a unqiue image tag is created for the deployment. 
It is recommended that for production deployments `draft` be set to `false`.

##### Logs

Logs are automatically stored in [AWS Cloud Watch Logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/WhatIsCloudWatchLogs.html) under 
the log group name `awslogs-far-{name}-{env}` and log stream `awslogs-{name}-{env}` in the region of the deployment.

The datetime format used for distinguishing between log events is `%Y-%m-%dT%H:%M:%S.%LZ`, however you may specify a custom datetime format by setting the `logDatetimeFormat` configuration option (format option can be found [here](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AgentReference.html)).

Log retention is 90 days by default, but you may specify a different retention policy through the `logRetention` configuration option. Possible values are 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653 days.

##### Environment Variables

`far` automatically defines three environment variables that are available to the running service:

* `AWS_REGION` - the AWS region that the service is deployed in
* `AWS_CLUSTER` - the cluster name running the service
* `MS_NAME` - the service name suffixed with the environment name, for example, if the service name is `my-project` and the env is `prod` then MS_NAME valus is `my-project-prod`

You may specify additional environment variables in the configuration file under the `variables` option

##### Secrets

The `secrets` configuration option is an array list of files to securly make available to the service via the [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/).
During the `deploy` command, `far` reads the contents of the secret file and uploads it to the secrets manager in the account, 
giving it the name `${MS_NAME}/<SECRET_ID>`. You may specify just the file name and the secret id will be the same as the file name, or specify the secret id and the path to the file containig the secret.

```yaml
secrets:
  # this creates a secret with the name "secrets/mySecretFile.json" with content from that file  
  - secrets/mySecretFile.json

  # this creates a secret with the name "secrets/myOtherFile.json" and content from file "../path/to/other/file.json"
  - secrets/myOtherFile.json: ../path/to/other/file.json
```

Files that are specified as `secrets` in the configuration file are automatically excluded from the built docker image.

You can specify additional files/directories to exclude from the docker image by listing them in your local `.dockerignore` file.

##### Subnets

The `subnets` configuration option is an array of subnet ids to assign to the service. If no subnets are specified, far searches for 
all the subnets that have a tag named `farSubnet` with a value of `true`. If at least one such subnet is found, all tagged subnets will be used.
If no tagged subnet is found, far will use the default subnets of the account.

##### Security Groups

The `securityGroups` configuration option is an array of security group ids to assign to the service. If no security groups are specified, far searches for all the security groups that have a tag named `farSecurityGroup` with a value of `true`. If at least one such security group is found, all tagged security groups will be used. If no tagged security group is found, far will not assign any security group to the service.

```bash
$ far deploy help
far deploy

deploy the local docker image and run it as a service

Options:
  --help            Show help                                                                                  [boolean]
  --version         Show version number                                                                        [boolean]
  --env             configuration file environment (e.g. specifying "prod" will load "farconfig.prod")
  --name            service name
  --region          aws region
  --cluster         aws cluster name
  --profile         aws credentials profile name from default AWS credentials file
  --tag             image tag. default tage name is the version in the package.json file
  --repository      the docker repository storing the docker image
  --draft           draft mode. in this mode every image tag is suffixed with a timestamp                      [boolean]
  --subnets         the subnets to associate with the deployment                                                 [array]
  --securityGroups  the security groups to associate with the deployment                                         [array]
  --cpu             vCPU reservation (256|512|1024|2048|4096)                                                   [number]
  --memory          memory reservation (aligned to vCPU)                                                        [number]
  --secrets         list of files to upload to AWS Secrets Manager                                               [array]
  --variables       environment variables to provide to the service (in the form of name=value)                  [array]
  --logRetention    number of days for log retention in CloudWatchLogs (default is 90)                          [number]
  --type            deployment type (fargate|ec2)
  --role            IAM role that containers in this task assume (default is "far-tasks", created automatically)
  --dockerfile      docker file to use for building the image
  --count           number of container instances to run in the service
```

#### `update`

The update command updates an existing service with new settings. 
It performs the same steps as the `deploy` command except for building and pushing a new docker image.

```bash
$ far update help
far update

update an existing service (cpu, memory, secrets, etc.) without deploying a new docker image

Options:
  --help            Show help                                                                                  [boolean]
  --version         Show version number                                                                        [boolean]
  --env             configuration file environment (e.g. specifying "prod" will load "farconfig.prod")
  --name            service name
  --region          aws region
  --cluster         aws cluster name
  --profile         aws credentials profile name from default AWS credentials file
  --tag             image tag. default tage name is the version in the package.json file
  --repository      the docker repository storing the docker image
  --draft           draft mode. in this mode every image tag is suffixed with a timestamp                      [boolean]
  --subnets         the subnets to associate with the deployment                                                 [array]
  --securityGroups  the security groups to associate with the deployment                                         [array]
  --cpu             vCPU reservation (256|512|1024|2048|4096)                                                   [number]
  --memory          memory reservation (aligned to vCPU)                                                        [number]
  --secrets         list of files with secrets to make available to the service container instances              [array]
  --variables       environment variables to provide to the service (in the form of name=value)                  [array]
  --logRetention    number of days for log retention in CloudWatchLogs (default is 90)                          [number]
  --type            deployment type (fargate|ec2)
  --role            IAM role that containers in this task assume (default is "far-tasks", created automatically)
```

#### `scale`

```bash
$ far scale help
far scale <count>

scale up or down the number of instances running in the service (0 will stop the service)

Positionals:
  count  number of container instances to run in the service                                         [number] [required]

Options:
  --help     Show help                                                                                         [boolean]
  --version  Show version number                                                                               [boolean]
  --env      configuration file environment (e.g. specifying "prod" will load "farconfig.prod")
  --name     service name
  --region   aws region
  --cluster  aws cluster name
  --profile  aws credentials profile name from default AWS credentials file
```

#### `stop`

```bash
$ far stop help
far stop

stop all container instances running in the service (same as 'scale 0')

Options:
  --help     Show help                                                                                         [boolean]
  --version  Show version number                                                                               [boolean]
  --env      configuration file environment (e.g. specifying "prod" will load "farconfig.prod")
  --name     service name
  --region   aws region
  --cluster  aws cluster name
  --profile  aws credentials profile name from default AWS credentials file
```

#### `status`

```bash
$ far status help
far status

view service status information

Options:
  --help     Show help                                                                                         [boolean]
  --version  Show version number                                                                               [boolean]
  --env      configuration file environment (e.g. specifying "prod" will load "farconfig.prod")
  --name     service name
  --region   aws region
  --cluster  aws cluster name
  --profile  aws credentials profile name from default AWS credentials file
  --events   number of events to display (0-100)      
```

#### `logs`

```bash
$ far logs help
far logs

view all container instances logs in the service

Options:
  --help     Show help                                                                                         [boolean]
  --version  Show version number                                                                               [boolean]
  --env      configuration file environment (e.g. specifying "prod" will load "farconfig.prod")
  --name     service name
  --region   aws region
  --cluster  aws cluster name
  --profile  aws credentials profile name from default AWS credentials file
  --start    start time of logs to view. default is current time
  --end      end time of logs to view. if not provided, logs will stream continuously  
```

#### `terminate`

```bash
$ far terminate help
far terminate

terminate the environment and all its resources

Options:
  --help     Show help                                                                                         [boolean]
  --version  Show version number                                                                               [boolean]
  --env      configuration file environment (e.g. specifying "prod" will load "farconfig.prod")
  --name     service name
  --region   aws region
  --cluster  aws cluster name
  --profile  aws credentials profile name from default AWS credentials file
```

## License

The MIT License (MIT)


