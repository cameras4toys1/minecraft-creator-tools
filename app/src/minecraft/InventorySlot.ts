export default class InventorySlot {
  name?: string;
  count?: number;
  slot: number;
  wasPickedUp?: boolean;
  damage?: number;

  constructor(slotIndex: number) {
    this.slot = slotIndex;
  }
}
