import IDocTypeReference from "./IDocTypeReference";

export default interface IDocObject {
  is_read_only: boolean;
  is_static: boolean;
  name: string;
  type: IDocTypeReference;
}
