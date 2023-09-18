class NodeifyScript {
  constructor() {}

  static create(root, aliases = {}) {
    return new NodeifyScript(root, aliases);
  }

  resolve(filePath, content) {
    if (filePath.toLowerCase().indexOf("/cli/") <= 0 && filePath.toLowerCase().indexOf("\\cli\\") <= 0) {
      return content;
    }
    return "#!/usr/bin/env node\r\n" + content;
  }
}

module.exports = NodeifyScript;
