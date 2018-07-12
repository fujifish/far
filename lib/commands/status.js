const chalk = require("chalk");
const Cmd = require("../cmd");
const terminal = require("../terminal");

class StatusCmd extends Cmd {
  constructor(config) {
    super(config);
  }

  async execute() {
    let result = await this.ecs
      .describeServices({
        cluster: this.config.cluster,
        services: [this.config.name]
      })
      .promise();
    let service = result.services[0];
    terminal.log(`Status:    ${this._status(service.status)}`);
    terminal.log(`Type:      ${service.launchType}`);
    terminal.log(`Created:   ${service.createdAt}`);
    terminal.log(`Cluster:   ${service.clusterArn}`);
    terminal.log(`Desired:   ${service.desiredCount}`);
    terminal.log(`Pending:   ${service.pendingCount}`);
    terminal.log(`Running:   ${service.runningCount}`);
    terminal.log(`Task Def.: ${service.taskDefinition}`);
    if (service.deployments) {
      terminal.log("Deployments:");
      service.deployments.forEach(dep => {
        terminal.log(
          `  ${this._status(dep.status)} ${dep.taskDefinition} ${dep.desiredCount}/${dep.pendingCount}/${
            dep.runningCount
          }`
        );
      });
    }
    if (service.events && this.config.events > 0) {
      let numEvents = Math.min(service.events.length, this.config.events);
      let moreEvents = "";
      if (service.events.length > numEvents) {
        moreEvents = ` (showing ${numEvents} out of ${service.events.length} total)`
      }
      terminal.log(`Events${moreEvents}:`);
      for (let i = 0; i < numEvents; ++i) {
        let e = service.events[i];
        terminal.log(`  [${new Date(e.createdAt).toISOString()}] ${e.message}`);
      }
    }
    if (service.failures) {
      terminal.log("Failures:");
      service.failures.forEach(f => {
        terminal.log(`  ${f.arn}: ${f.reason}`);
      });
    }
  }

  _status(status) {
    let color = {
      ACTIVE: "green",
      INACTIVE: "red",
      DRAINING: "blue",
      PRIMARY: "blue"
    }[status];
    return chalk[color](status);
  }
}

module.exports = StatusCmd;
