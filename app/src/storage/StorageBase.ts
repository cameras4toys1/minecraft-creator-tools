// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import IStorage, { IFolderMove, StorageErrorStatus } from "./IStorage";
import IFolder from "./IFolder";
import IFile from "./IFile";
import { EventDispatcher } from "ste-events";

export default abstract class StorageBase implements IStorage {
  abstract rootFolder: IFolder;
  isContentUpdated: boolean = false;
  readOnly: boolean = false;

  #onFileAdded = new EventDispatcher<StorageBase, IFile>();
  #onFileRemoved = new EventDispatcher<StorageBase, string>();
  #onFileContentsUpdated = new EventDispatcher<StorageBase, IFile>();
  #onFolderMoved = new EventDispatcher<StorageBase, IFolderMove>();

  #storagePath: string | undefined;

  errorStatus?: StorageErrorStatus;
  errorMessage?: string;

  channelId?: string;

  public get storagePath() {
    return this.#storagePath;
  }

  public set storagePath(newStoragePath: string | undefined) {
    this.#storagePath = newStoragePath;
  }

  abstract joinPath(pathA: string, pathB: string): string;

  public resetContentUpdated() {
    this.isContentUpdated = false;
  }

  public get onFileAdded() {
    return this.#onFileAdded.asEvent();
  }

  public get onFileRemoved() {
    return this.#onFileRemoved.asEvent();
  }

  public get onFileContentsUpdated() {
    return this.#onFileContentsUpdated.asEvent();
  }

  public get onFolderMoved() {
    return this.#onFolderMoved.asEvent();
  }

  async ensureFolderFromStorageRelativePath(path: string) {
    return this.rootFolder.ensureFolderFromRelativePath(path);
  }

  notifyFileAdded(file: IFile) {
    this.#onFileAdded.dispatch(this, file);
  }

  notifyFileContentsUpdated(file: IFile) {
    this.isContentUpdated = true;
    this.#onFileContentsUpdated.dispatch(this, file);
  }

  notifyFolderMoved(folderMove: IFolderMove) {
    this.isContentUpdated = true;
    this.#onFolderMoved.dispatch(this, folderMove);
  }

  notifyFileRemoved(fileName: string) {
    this.#onFileRemoved.dispatch(this, fileName);
  }
}
