# far

CLI for deploying a docker container to AWS Fargate/ECS and running it as a service. `far` automates the process of building the docker image, setting up the AWS cluster, defining the service and creating task definitions. All that's required are AWS account credentials.

## Installation

```bash
npm install -g @capriza/far
```

## Getting Started

Assume a project directory named `my-project` with a Dockerfile you want to deploy to region `eu-west-1` of AWS.

#### Prerequesits:

* AWS account
* Docker installed and running. Get Docker from [this location](https://docs.docker.com/install/)

### AWS Credentials

`far` operates against an AWS account, and it is expected that the access credentials exist in the 
`$HOME/.aws/credentials` file under an existing profile. If the profile does not exist, you will be asked to add it when running `far init`.
See [Named Profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-multiple-profiles.html) for more information on the AWS credentials. 

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

When deploying the image is tagged with value of the `tag` option. If the tag option is not provided,
an attempt is made to read the `version` file from the local package.json. If the tag already exists in the remote AWS respository then the deploy fails.

If `draft` is set to `true` then the image tag is suffixed with the current timsestamp so that every time a deploy is executed a unqiue image tag is created for the deployment. It is recommended that for production deployments `draft` be set to `false`.

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
  --draft           draft mode. in this mode every image tag is suffixed with a timestamp                      [boolean]
  --subnets         the subnets to associate with the deployment                                                 [array]
  --securityGroups  the security groups to associate with the deployment                                         [array]
  --cpu             vCPU reservation (256|512|1024|2048|4096)                                                   [number]
  --memory          memory reservation (aligned to vCPU)                                                        [number]
  --secrets         list of files with secrets to make available to the service container instances              [array]
  --variables       environment variables to provide to the service (in the form of name=value)                  [array]
  --type            deployment type (fargate|ec2)
  --role            IAM role that containers in this task assume
  --dockerfile      docker file to use for building the image
  --count           number of container instances to run in the service
```

#### `update`

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
  --draft           draft mode. in this mode every image tag is suffixed with a timestamp                      [boolean]
  --subnets         the subnets to associate with the deployment                                                 [array]
  --securityGroups  the security groups to associate with the deployment                                         [array]
  --cpu             vCPU reservation (256|512|1024|2048|4096)                                                   [number]
  --memory          memory reservation (aligned to vCPU)                                                        [number]
  --secrets         list of files with secrets to make available to the service container instances              [array]
  --variables       environment variables to provide to the service (in the form of name=value)                  [array]
  --type            deployment type (fargate|ec2)
  --role            IAM role that containers in this task assume
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


