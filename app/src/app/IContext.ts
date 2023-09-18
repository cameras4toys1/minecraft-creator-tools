import Carto from "./Carto";
import IMinecraft from "./IMinecraft";
import Project from "./Project";

export default interface IContext {
  carto: Carto;
  project?: Project;
  minecraft?: IMinecraft;
  host?: any;
}
