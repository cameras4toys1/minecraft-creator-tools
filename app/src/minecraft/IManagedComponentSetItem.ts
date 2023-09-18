import IComponent from "./IComponent";
import { IEvent } from "ste-events";
import IManagedComponent from "./IManagedComponent";

export default interface IManagedComponentSetItem {
  addComponent(id: string, component: IManagedComponent): void;
  removeComponent(id: string): void;
  getComponent(id: string): IManagedComponent | undefined;
  getComponents(): IManagedComponent[];
  notifyComponentUpdated(id: string): void;

  onComponentAdded: IEvent<IManagedComponentSetItem, IManagedComponent>;
  onComponentRemoved: IEvent<IManagedComponentSetItem, string>;
  onComponentChanged: IEvent<IManagedComponentSetItem, IManagedComponent>;
}
