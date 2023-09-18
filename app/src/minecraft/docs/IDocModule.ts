import IDocClass from "./IDocClass";
import IDocScriptEnum from "./IDocScriptEnum";

export default interface IDocModule {
  classes: IDocClass[];
  constants: [];
  dependencies: [];
  enums: IDocScriptEnum[];
  functions: [];
  interfaces: IDocClass[];
  minecraft_version: string;
  module_type: string;
  name: string;
  objects: [];
  uuid: string;
  version: string;
}
