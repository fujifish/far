const readline = require("readline");
const Cmd = require("../cmd");
const terminal = require("../terminal");

class TerminateCmd extends Cmd {
  constructor(config) {
    super(config);
  }

  async execute() {
    return new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question(`Type the name of the service ("${this.config.name}"): `, async answer => {
        rl.close();
        if (this.config.name !== answer) {
          return reject(new Error(`service name mismatch, operation aborted`));
        }

        try {
          terminal.progressStart(`Terminating service ${this.config.name}`);
          try {
            await this.ecs
              .updateService({
                cluster: this.config.cluster,
                service: this.config.name,
                desiredCount: 0
              })
              .promise();
            await this.ecs
              .deleteService({
                cluster: this.config.cluster,
                service: this.config.name
              })
              .promise();
            terminal.progressEnd();
          } catch (e) {
            terminal.progressEnd(e.message);
          }
          terminal.progressStart(`Deleting repository ${this.config.name}`);
          try {
            await this.ecr
              .deleteRepository({
                repositoryName: this.config.name,
                force: true
              })
              .promise();
            terminal.progressEnd();
          } catch (e) {
            terminal.progressEnd(e.message);
          }

          if (this.config.secrets) {
            terminal.progressStart(`Deleting ${this.config.name} secrets`);
            for (let i = 0; i < this.config.secrets.length; ++i) {
              try {
                await this.sm
                  .deleteSecret({
                    RecoveryWindowInDays: 7,
                    SecretId: `${this.config.name}/${this.config.secrets[i]}`
                  })
                  .promise();
              } catch (e) {
                // ignore
              }
            }
            terminal.progressEnd();
          }
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  }
}

module.exports = TerminateCmd;
