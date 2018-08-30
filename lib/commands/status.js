const chalk = require("chalk");
const table = require("table").table;
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
    result = await this.ecs
      .describeTaskDefinition({
        taskDefinition: service.taskDefinition
      })
      .promise();
    let definition = result.taskDefinition;
    terminal.log(`Status:    ${this._status(service.status)}`);
    terminal.log(`Type:      ${service.launchType}`);
    terminal.log(`Created:   ${service.createdAt}`);
    terminal.log(`Cluster:   ${service.clusterArn}`);
    if (service.deployments) {
      terminal.log(`Deployments:`);
      let deployments = [["Status", "Desired", "Pending", "Running", "Task Definition / Image"]];
      service.deployments.forEach(dep => {
        deployments.push([
          this._status(dep.status),
          dep.desiredCount,
          dep.pendingCount,
          dep.runningCount,
          `${service.taskDefinition} ${definition.containerDefinitions[0].image}`
        ]);
      });
      let tableOutput = table(deployments, {
        columns: {
          4: {
            alignment: "left",
            wrapWord: true,
            width: 90
          }
        }
      });
      terminal.log(tableOutput);
    }

    if (service.events && this.config.events > 0) {
      let numEvents = Math.min(service.events.length, this.config.events);
      let moreEvents = "";
      if (service.events.length > numEvents) {
        moreEvents = ` (showing latest ${numEvents} out of ${service.events.length} total)`;
      }
      terminal.log(`Events${moreEvents}:`);
      for (let i = 0; i < numEvents; ++i) {
        let e = service.events[i];
        terminal.log(` [${new Date(e.createdAt).toISOString()}] ${e.message}`);
      }
    }
    if (service.failures) {
      terminal.log("Failures:");
      service.failures.forEach(f => {
        terminal.log(` ${f.arn}: ${f.reason}`);
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
