const path = require("path");
const os = require("os");
const fs = require("fs");
const ini = require("ini");

class AWSConfig {

  constructor(profile) {
    this.profileName = profile;
    let awsDir = path.resolve(os.homedir(), ".aws");
    let awsConfigFile = path.resolve(awsDir, "config");
    try {
      this.settings = ini.parse(fs.readFileSync(awsConfigFile, "utf8"));
      this.loaded = true;
      this._loadProfileConfig(this.profileName);
    } catch (e) {
      if (e.code !== "ENOENT") {
        throw e;
      }
    }
  }

  _loadProfileConfig(profileName) {
    let profile = this.settings[`profile ${profileName}`];
    if (profile) {
      if (profile.source_profile) {
        this._loadProfileConfig(profile.source_profile)
      }
      for (let conf in profile) {
          this[conf] = profile[conf];
      }
    } else {
      this.loaded = false;
    }
  }
}

module.exports = AWSConfig;