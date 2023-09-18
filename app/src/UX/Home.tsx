import { Component, SyntheticEvent } from "react";
import IAppProps from "./IAppProps";
import { AppMode } from "./App";
import "./Home.css";
import {
  List,
  Button,
  ListProps,
  Dialog,
  Input,
  InputProps,
  Dropdown,
  DropdownProps,
  ThemeInput,
  FormInput,
} from "@fluentui/react-northstar";
import { NewProjectTemplateType } from "./App";
import Carto from "./../app/Carto";
import Project from "./../app/Project";
import Utilities from "../core/Utilities";
import Log from "../core/Log";
import IGallery from "../app/IGallery";
import IFolder from "../storage/IFolder";
import IGalleryProject from "../app/IGalleryProject";
import Database from "../minecraft/Database";
import { GalleryProjectCommand } from "./ProjectGallery";
import { LocalGalleryCommand, LocalFolderType } from "./LocalGallery";
import AppServiceProxy, { AppServiceProxyCommands } from "../core/AppServiceProxy";
import ProjectGallery from "./ProjectGallery";
import LocalGallery from "./LocalGallery";
import { ProjectScriptLanguage } from "../app/IProjectData";
import { constants } from "../core/Constants";
import StorageUtilities from "../storage/StorageUtilities";
import { ComputerLabel, ConnectLabel, ExportBackupLabel } from "./Labels";
import FileSystemStorage from "../storage/FileSystemStorage";
import CartoApp, { CartoThemeStyle } from "../app/CartoApp";
import UrlUtilities from "../core/UrlUtilities";
import { ProjectTileDisplayMode } from "./ProjectTile";

enum HomeDialogMode {
  none = 0,
  newProject = 1,
  errorMessage = 2,
}

interface IHomeProps extends IAppProps {
  theme: ThemeInput<any>;
  errorMessage: string | undefined;
  onModeChangeRequested?: (mode: AppMode) => void;
  onProjectSelected?: (project: Project) => void;
  onGalleryItemCommand: (command: GalleryProjectCommand, project: IGalleryProject) => void;
  onLocalGalleryItemCommand: (command: LocalGalleryCommand, folderType: LocalFolderType, folder: IFolder) => void;
  onNewProjectSelected?: (
    name: string,
    newProjectType: NewProjectTemplateType,
    path?: string,
    preferredScriptLanguage?: ProjectScriptLanguage,
    additionalFilePath?: string,
    additionalFile?: File
  ) => void;
  onNewProjectFromFolderSelected?: (folder: string) => void;
  onNewProjectFromFolderInstanceSelected?: (folder: IFolder, name?: string) => void;
}

export enum HomeEffect {
  none = 0,
  dragOver = 1,
}

interface IHomeState {
  gallery: IGallery | undefined;
  dialogMode: HomeDialogMode;
  effect: HomeEffect;
  search?: string;
  errorMessage?: string;
  newProjectName?: string;
  newProjectPath?: string;
}

export default class Home extends Component<IHomeProps, IHomeState> {
  _carto?: Carto;
  _tentativeNewProjectLanguage: ProjectScriptLanguage = ProjectScriptLanguage.typeScript;

  constructor(props: IHomeProps) {
    super(props);

    this._handleProjectGalleryCommand = this._handleProjectGalleryCommand.bind(this);
    this._handleLocalGalleryCommand = this._handleLocalGalleryCommand.bind(this);

    if (this.props.errorMessage) {
      this.state = {
        gallery: undefined,
        effect: HomeEffect.none,
        dialogMode: HomeDialogMode.errorMessage,
        errorMessage: this.props.errorMessage,
      };
    } else {
      this.state = {
        gallery: undefined,
        effect: HomeEffect.none,
        dialogMode: HomeDialogMode.none,
      };
    }

    this._onCartoLoaded = this._onCartoLoaded.bind(this);
    this._handleNewProjectSelectedClick = this._handleNewProjectSelectedClick.bind(this);
    this._handleOpenFolderClick = this._handleOpenFolderClick.bind(this);
    this._handleOpenLocalFolderClick = this._handleOpenLocalFolderClick.bind(this);
    this._handleProjectSelected = this._handleProjectSelected.bind(this);
    this._handleNewProjectCancel = this._handleNewProjectCancel.bind(this);
    this._handleNewProjectConfirm = this._handleNewProjectConfirm.bind(this);
    this._handleErrorMessageConfirm = this._handleErrorMessageConfirm.bind(this);
    this._handleNewProjectName = this._handleNewProjectName.bind(this);
    this._handleNewProjectNameChange = this._handleNewProjectNameChange.bind(this);
    this._handleSelectFolderClick = this._handleSelectFolderClick.bind(this);
    this._handleLanguageChange = this._handleLanguageChange.bind(this);
    this._handleExportToolClick = this._handleExportToolClick.bind(this);
    this._handleExportAllClick = this._handleExportAllClick.bind(this);
    this._handleNewSearch = this._handleNewSearch.bind(this);
    this._handleConnectClick = this._handleConnectClick.bind(this);
    this._onGalleryLoaded = this._onGalleryLoaded.bind(this);
    this._handleFileUpload = this._handleFileUpload.bind(this);
    this._handleFileDrop = this._handleFileDrop.bind(this);
    this._handleFileDragOut = this._handleFileDragOut.bind(this);
    this._handleFileDragOver = this._handleFileDragOver.bind(this);
    this._processInputtedEntry = this._processInputtedEntry.bind(this);
    this._processIncomingFile = this._processIncomingFile.bind(this);
    this._startDelayLoadItems = this._startDelayLoadItems.bind(this);

    if (typeof window !== "undefined") {
      window.setTimeout(this._startDelayLoadItems, 10);
    }
  }

  private _handleFileDragOut(event: any) {
    const top = event.pageY;
    const left = event.pageX;
    const right = document.body.clientWidth - left;
    const bottom = document.body.clientHeight - top;

    if (top < 10 || right < 10 || bottom < 10 || left < 10) {
      this._stopDragEffect();
    }
  }

  private _stopDragEffect() {
    if (this.state !== undefined) {
      if (this.state.effect === HomeEffect.dragOver) {
        this.setState({
          gallery: this.state.gallery,
          dialogMode: this.state.dialogMode,
          search: this.state.search,
          effect: HomeEffect.none,
          newProjectName: this.state.newProjectName,
          newProjectPath: this.state.newProjectPath,
        });
      }
    }
  }

  private _handleFileDragOver(event: any) {
    if (this.state !== undefined) {
      if (this.state.effect !== HomeEffect.dragOver) {
        const top = event.pageY;
        const left = event.pageX;
        const right = document.body.clientWidth - left;
        const bottom = document.body.clientHeight - top;

        if (top > 10 && right > 10 && bottom > 10 && left > 10) {
          this.setState({
            gallery: this.state.gallery,
            dialogMode: this.state.dialogMode,
            effect: HomeEffect.dragOver,
            newProjectName: this.state.newProjectName,
            newProjectPath: this.state.newProjectPath,
          });
        }
      }
    }

    if (event == null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  componentDidMount() {
    if (typeof window !== "undefined") {
      window.document.addEventListener("dragleave", this._handleFileDragOut);
      window.document.body.addEventListener("dragover", this._handleFileDragOver);
      window.document.body.addEventListener("drop", this._handleFileDrop);
    }

    this._updateCarto();
  }

  componentWillUnmount() {
    if (typeof window !== "undefined") {
      window.document.removeEventListener("dragleave", this._handleFileDragOut);
      window.document.body.removeEventListener("dragover", this._handleFileDragOver);
      window.document.body.removeEventListener("drop", this._handleFileDrop);
    }
  }

  private async _handleFileDrop(ev: DragEvent): Promise<any> {
    ev.preventDefault();
    ev.stopPropagation();

    if (ev == null || ev.dataTransfer == null) {
      return;
    }

    if (ev.dataTransfer.items) {
      for (var i = 0; i < ev.dataTransfer.items.length; i++) {
        const dtitem = ev.dataTransfer.items[i];

        let entry: any | undefined = undefined;

        if (dtitem.webkitGetAsEntry) {
          entry = dtitem.webkitGetAsEntry();
        }

        if (entry && entry.isDirectory) {
          const directoryReader = (entry as any).createReader();
          const me = this;

          directoryReader.readEntries(function (entries: any) {
            entries.forEach((childEntry: any) => {
              me._processInputtedEntry((entry as any).fullPath, childEntry);
            });
          });
        } else if (dtitem.kind === "file") {
          const file = dtitem.getAsFile();
          if (file) {
            this._processIncomingFile("/", file);
          }
        }
      }
    } else {
      // Use DataTransfer interface to access the file(s)
      for (var j = 0; j < ev.dataTransfer.files.length; j++) {
        console.log("... file[" + j + "].name = " + ev.dataTransfer.files[j].name);
      }
    }

    this._stopDragEffect();
  }

  private _processInputtedEntry(path: string, entry: any) {
    if (entry.file) {
      entry.file((file: File) => {
        this._processIncomingFile(path, file);
      });
    }
  }

  private async _processIncomingFile(path: string, file: File) {
    if (file != null && this.props.onNewProjectSelected) {
      let fileName = "File";

      if (file.name) {
        fileName = file.name;

        fileName = StorageUtilities.getBaseFromName(fileName);
      }

      this.props.onNewProjectSelected(
        fileName,
        NewProjectTemplateType.empty,
        undefined,
        ProjectScriptLanguage.typeScript,
        path,
        file
      );
    }
  }

  private _startDelayLoadItems() {
    // load things in the background while we're on the home screen.
    Database.loadUx();
    //Database.loadContent();
    //Database.loadDefaultBehaviorPack();
  }

  get carto() {
    return this._carto;
  }

  private _onGalleryLoaded() {
    this.setState({
      gallery: this.props.carto.gallery,
      dialogMode: this.state.dialogMode,
      effect: this.state.effect,
      newProjectName: this.state.newProjectName,
      newProjectPath: this.state.newProjectPath,
    });
  }

  private _handleNewProjectNameChange(e: SyntheticEvent, data: (InputProps & { value: string }) | undefined) {
    if (data === undefined || this.state == null) {
      return;
    }

    this.setState({
      gallery: this.state.gallery,
      dialogMode: this.state.dialogMode,
      effect: this.state.effect,
      newProjectName: data.value,
      newProjectPath: this.state.newProjectPath,
    });
  }

  componentDidUpdate(prevProps: IHomeProps, prevState: IHomeState) {
    this.setCarto(this.props.carto);
  }

  async _handleConnectClick() {
    if (this.props.onModeChangeRequested) {
      this.props.onModeChangeRequested(AppMode.serverManagerPlusBack);
    }
  }

  _handleExportToolClick() {
    if (this.props.onModeChangeRequested === undefined) {
      Log.unexpectedUndefined("HETC");
      return;
    }

    this.props.onModeChangeRequested(AppMode.exporterTool);
  }

  async _handleExportAllClick() {
    const operId = this.props.carto.notifyOperationStarted("Exporting all projects as zip.");

    const zipStorage = await this.props.carto.getExportZip();

    const zipBinary = await zipStorage.generateBlobAsync();

    this.props.carto.notifyOperationEnded(operId, "Export of projects created; downloading");

    saveAs(zipBinary, "mctbackup." + Utilities.getDateSummary(new Date()) + ".zip");
  }

  async _updateCarto() {
    await this.setCarto(this.props.carto);

    if (!this.carto) {
      return;
    }

    if (this.carto.galleryLoaded) {
      this.setState({
        gallery: this.carto.gallery,
        dialogMode: this.state.dialogMode,
      });
    } else {
      this.carto.onGalleryLoaded.subscribe(this._onGalleryLoaded);
      this.carto.loadGallery();
    }
  }

  async setCarto(newCarto: Carto | undefined) {
    if (this._carto !== newCarto) {
      this._carto = newCarto;

      if (this._carto != null) {
        this._carto.onLoaded.subscribe(this._onCartoLoaded);

        await this._carto.load();
      }
    }
  }

  private _onCartoLoaded(source: Carto, target: Carto) {
    this.forceUpdate();
    this._loadSnippets();
  }

  private async _loadSnippets() {
    await Database.loadSnippets();
    this.forceUpdate();
  }

  private async _handleSelectFolderClick() {
    Log.debug("Opening folder via services.");

    const result = await AppServiceProxy.sendAsync(AppServiceProxyCommands.openFolder, "");

    if (result.length > 0) {
      this.setState({
        gallery: this.state.gallery,
        dialogMode: this.state.dialogMode,
        newProjectName: this.state.newProjectName,
        newProjectPath: result,
      });
    }
  }

  private async _handleNewProjectSelectedClick() {
    const projectName = await this.props.carto.getNewProjectName("Project");

    this.setState({
      gallery: this.state?.gallery,
      dialogMode: HomeDialogMode.newProject,
      newProjectName: projectName,
    });
  }

  private async _handleNewProjectName() {
    this.setState({
      gallery: this.state?.gallery,
      dialogMode: HomeDialogMode.newProject,
    });
  }

  private _handleNewProjectCancel() {
    this.setState({
      gallery: this.state?.gallery,
      dialogMode: HomeDialogMode.none,
    });
  }

  private _handleErrorMessageConfirm() {
    this.setState({
      gallery: this.state?.gallery,
      dialogMode: HomeDialogMode.none,
    });
  }

  private _handleNewProjectConfirm() {
    this.setState({
      gallery: this.state?.gallery,
      dialogMode: HomeDialogMode.none,
    });

    if (this.props.onNewProjectSelected && this.state?.newProjectName !== undefined) {
      this.props.onNewProjectSelected(
        this.state.newProjectName,
        NewProjectTemplateType.gameTest,
        this.state.newProjectPath,
        this._tentativeNewProjectLanguage
      );
    }
  }

  private async _handleOpenFolderClick() {
    const result = await AppServiceProxy.sendAsync(AppServiceProxyCommands.openFolder, "");

    if (result.length > 0) {
      if (this.props.onNewProjectFromFolderSelected !== undefined) {
        this.props.onNewProjectFromFolderSelected(result);
      }
    }
  }

  private async _handleOpenLocalFolderClick() {
    const result = (await window.showDirectoryPicker({
      mode: "readwrite",
    })) as FileSystemDirectoryHandle | undefined;

    if (result && this.props.onNewProjectFromFolderInstanceSelected) {
      const storage = new FileSystemStorage(result);

      await this.props.onNewProjectFromFolderInstanceSelected(storage.rootFolder, result.name);
    }
  }

  _handleLanguageChange(
    event: React.MouseEvent<Element, MouseEvent> | React.KeyboardEvent<Element> | null,
    data: DropdownProps
  ) {
    if (data.value === "TypeScript") {
      this._tentativeNewProjectLanguage = ProjectScriptLanguage.typeScript;
    } else {
      this._tentativeNewProjectLanguage = ProjectScriptLanguage.javaScript;
    }
  }

  private async _handleProjectSelected(elt: any, event: ListProps | undefined) {
    if (
      event === undefined ||
      event.selectedIndex === undefined ||
      this.carto === null ||
      this.props.onProjectSelected === undefined
    ) {
      return;
    }

    const newProject = this.props.carto.projects[event.selectedIndex];

    const folder = await newProject.ensureProjectFolder();

    const doesExist = await folder.exists();

    if (!doesExist) {
      this.setState({
        errorMessage: "Project at '" + folder.fullPath + "' does not appear to exist. Is it on this device?",
        dialogMode: HomeDialogMode.errorMessage,
      });
      return;
    }

    if (this.props && this.props.onNewProjectSelected !== undefined) {
      this.props.onProjectSelected(newProject as Project);
    }
  }

  private _handleProjectGalleryCommand(command: GalleryProjectCommand, project: IGalleryProject) {
    if (this.props.onGalleryItemCommand !== undefined) {
      this.props.onGalleryItemCommand(command, project);
    }
  }

  private _handleLocalGalleryCommand(command: LocalGalleryCommand, folderType: LocalFolderType, folder: IFolder) {
    if (this.props.onLocalGalleryItemCommand !== undefined) {
      this.props.onLocalGalleryItemCommand(command, folderType, folder);
    }
  }

  private _compareProjects(projectA: Project, projectB: Project) {
    if (projectA.modified === null || projectB.modified === null) {
      return 0;
    }

    return projectB.modified.getTime() - projectA.modified.getTime();
  }

  private async _handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    if (!event.target || !event.target.files || event.target.files.length <= 0 || !this.props.carto.packStorage) {
      return;
    }

    const file = event.target.files[0];

    if (!file) {
      return;
    }

    this._processIncomingFile("/", file);
  }

  _handleNewSearch(
    event: SyntheticEvent<HTMLElement, Event> | React.KeyboardEvent<Element> | null,
    data: (InputProps & { value: string }) | undefined
  ) {
    if (event === null || data === null || data === undefined || !this.state) {
      return;
    }

    const newSearch = data.value;

    this.setState({
      gallery: this.state.gallery,
      dialogMode: this.state.dialogMode,
      search: newSearch,
      effect: this.state.effect,
      newProjectName: this.state.newProjectName,
      newProjectPath: this.state.newProjectPath,
    });
  }

  render() {
    const projectListItems = [];

    let openButton = <></>;
    let dialogArea = <></>;
    let localGallery = <></>;
    const webOnlyLinks: any[] = [];

    if (this.props === null || this.props.carto === null) {
      return;
    }

    const sortedProjects = this.props.carto.projects.sort(this._compareProjects);

    for (let i = 0; i < sortedProjects.length; i++) {
      const project = sortedProjects[i];

      let modifiedSummary = "";

      if (project.modified != null) {
        modifiedSummary = Utilities.getFriendlySummary(project.modified);
      }

      projectListItems.push({
        key: "SP" + project.name + i,
        header: project.name,
        headerMedia: modifiedSummary,
        content: " ",
      });
    }

    let gallery = <div>Loading cool stuff...</div>;

    if (this.state !== null && this.state.gallery !== undefined) {
      gallery = (
        <div>
          <div className="home-gallery-label">Start from a code snippet, template or starter</div>
          <ProjectGallery
            theme={this.props.theme}
            search={this.state.search}
            view={ProjectTileDisplayMode.large}
            onGalleryItemCommand={this._handleProjectGalleryCommand}
            carto={this.props.carto}
            gallery={this.state.gallery}
          />
        </div>
      );
    }

    if (this.state !== null && AppServiceProxy.hasAppService) {
      localGallery = (
        <div>
          <div className="home-gallery-label">Start from an existing Minecraft World/Project</div>{" "}
          <LocalGallery
            search={this.state.search}
            onGalleryItemCommand={this._handleLocalGalleryCommand}
            carto={this.props.carto}
          />
        </div>
      );
    }

    if (AppServiceProxy.hasAppService) {
      openButton = (
        <span className="home-openButton">
          <Button
            onClick={this._handleOpenFolderClick}
            key="openFolder"
            content={<ComputerLabel isCompact={false} />}
          />
        </span>
      );
    } else {
      openButton = (
        <span className="home-openLocal">
          <Button
            onClick={this._handleOpenLocalFolderClick}
            content={<ComputerLabel isCompact={false} />}
            key="openFolderA"
          />
        </span>
      );

      if (CartoApp.theme !== CartoThemeStyle.dark) {
        webOnlyLinks.push(<span key="darksp">&#160;&#160;/&#160;&#160;</span>);
        webOnlyLinks.push(
          <a key="darkLink" href={UrlUtilities.ensureProtocol(window.location.href, "theme", "dark")}>
            Dark Theme
          </a>
        );
      }
      if (CartoApp.theme !== CartoThemeStyle.light) {
        webOnlyLinks.push(<span key="lightsp">&#160;&#160;/&#160;&#160;</span>);
        webOnlyLinks.push(
          <a key="lightLink" href={UrlUtilities.ensureProtocol(window.location.href, "theme", "light")}>
            Light Theme
          </a>
        );
      }
    }

    if (this.state?.dialogMode === HomeDialogMode.newProject) {
      const additionalDialogButtons = [];

      if (AppServiceProxy.hasAppServiceOrDebug) {
        let path = this.state.newProjectPath;

        if (path === undefined) {
          let delimiter = "\\";

          if (!AppServiceProxy.hasAppService) {
            delimiter = "/";
          }

          path = this.carto?.projectsStorage.rootFolder.fullPath + delimiter + this.state.newProjectName;
        }

        additionalDialogButtons.push(
          <div key="newFolderLabel" className="home-newFolder">
            Store project at:
          </div>
        );

        additionalDialogButtons.push(
          <div className="home-newPath" key="newPath">
            <div className="home-path">{path}</div>
            <Button
              onClick={this._handleSelectFolderClick}
              content="Select Folder"
              key="selectFolder"
              icon={<ComputerLabel isCompact={false} />}
              iconPosition="before"
            />
          </div>
        );
      }

      const newDialogInnerContent = (
        <div className="home-dialog">
          <div className="home-newName">Name:</div>
          <div className="home-newProjectText">
            <Input
              clearable
              placeholder="Name"
              key="newProjectName"
              defaultValue={this.state.newProjectName}
              onChange={this._handleNewProjectNameChange}
            />
          </div>
          <div className="home-newType">Script Type:</div>
          <div className="home-newScriptType">
            <Dropdown
              items={["TypeScript", "JavaScript"]}
              defaultValue="TypeScript"
              key="projectTypeDropdown"
              onChange={this._handleLanguageChange}
            />
          </div>
          {additionalDialogButtons}
        </div>
      );

      dialogArea = (
        <Dialog
          open={true}
          cancelButton="Cancel"
          confirmButton="OK"
          onCancel={this._handleNewProjectCancel}
          onConfirm={this._handleNewProjectConfirm}
          content={newDialogInnerContent}
          header={"New Minecraft Project"}
        />
      );
    } else if (this.state?.dialogMode === HomeDialogMode.errorMessage) {
      const newDialogInnerContent = (
        <div className="home-dialog">
          <div className="home-newName">{this.state.errorMessage}</div>
        </div>
      );

      dialogArea = (
        <Dialog
          open={true}
          cancelButton="Cancel"
          confirmButton="OK"
          onCancel={this._handleErrorMessageConfirm}
          onConfirm={this._handleErrorMessageConfirm}
          content={newDialogInnerContent}
          header={"New Minecraft Project"}
        />
      );
    }

    let areaHeight = "100vh";
    let projectsListHeight = "calc(100vh - 570px)";

    if (AppServiceProxy.hasAppService) {
      areaHeight = "calc(100vh - 36px)";
      projectsListHeight = "calc(100vh - 620px)";
    }

    const extensionsArea = [];
    const recentsArea = [];

    extensionsArea.push(
      <span className="home-tools-wrap" key="exportButton">
        <Button
          onClick={this._handleExportToolClick}
          key="export"
          content={<ExportBackupLabel isCompact={false} />}
          iconPosition="before"
        />
      </span>
    );

    extensionsArea.push(
      <span className="home-tools-connectWrap" key="toolsWrapper">
        <Button onClick={this._handleConnectClick} content={<ConnectLabel isCompact={false} />} key="connect" />
      </span>
    );

    if (projectListItems.length > 0) {
      recentsArea.push(
        <div key="recentlyOpenedLabel" className="home-projects">
          Recently opened
        </div>
      );
      recentsArea.push(
        <div key="homeProjectsList" className="home-projects-list" style={{ maxHeight: projectsListHeight }}>
          <List
            selectable
            defaultSelectedIndex={0}
            items={projectListItems}
            onSelectedIndexChange={this._handleProjectSelected}
          />
        </div>
      );
    }
    let storageAction = <></>;
    let storageMessage = undefined;

    if (AppServiceProxy.hasAppService) {
      storageMessage = "projects are saved in the mctools subfolder of your Documents library.";
    } else {
      storageMessage = "take care: projects are saved locally in your browser's storage on your device.";
      storageAction = (
        <span>
          &#160;&#160;
          <span className="home-clickLink" onClick={this._handleExportAllClick}>
            Save backups frequently.
          </span>
        </span>
      );
    }
    let effectArea = <></>;

    if (this.state.effect === HomeEffect.dragOver) {
      effectArea = <div className="home-dragOver">Drop any additional files here.</div>;
    }

    let errorMessageContainer = <></>;

    if (this.props.errorMessage) {
      errorMessageContainer = <div className="home-error">{this.props.errorMessage}</div>;
    }

    let toolsArea = <></>;

    if (Utilities.isDebug) {
      toolsArea = (
        <div key="toolsWindow" className="home-tools">
          Tools
          <div className="home-tools-bin" key="toolsButtons">
            {extensionsArea}
          </div>
        </div>
      );
    }

    return (
      <div className="home-layout" style={{ minHeight: areaHeight, height: areaHeight }}>
        {effectArea}
        {dialogArea}
        <div className="home-header-area">
          <div className="home-header">
            <div className="home-header-image">&#160;</div>
            <div className="home-header-sublink">
              <a
                href="https://silver-guide-3a7f4789.pages.github.io/docs/"
                className="home-header-docsLink"
                target="_blank"
                rel="noreferrer noopener"
              >
                Docs
              </a>
              &#160;&#160;/&#160;&#160;
              <a
                href="https://github.com/mojang/minecraft-creator-tools-internal"
                target="_blank"
                rel="noreferrer noopener"
              >
                GitHub
              </a>
              {webOnlyLinks}
            </div>
          </div>
        </div>
        <div className="home-projects-bin">
          {toolsArea}
          <div className="home-projects-buttonbar">
            {openButton}
            <span className="home-tools-export" key="exportButton">
              <Button
                onClick={this._handleExportAllClick}
                key="export"
                content={<ExportBackupLabel isCompact={false} />}
                iconPosition="before"
              />
            </span>
            <div className="home-uploadButton">
              <div className="home-uploadLabel">Start from a zip/MCWorld/MCPack file</div>
              <input type="file" title="uploadPack" onChange={this._handleFileUpload} />
            </div>
          </div>
          {recentsArea}
        </div>
        <div
          className="home-gallery"
          style={{
            backgroundColor: this.props.theme.siteVariables?.colorScheme.brand.background2,
            color: this.props.theme.siteVariables?.colorScheme.brand.foreground2,
          }}
        >
          {errorMessageContainer}
          <div className="home-search-area">
            <FormInput
              id="projSearch"
              className="home-search"
              defaultValue={""}
              placeholder="Search for starters"
              value={this.state.search}
              onChange={this._handleNewSearch}
            />
          </div>
          <div className="home-gallery-interior">
            {localGallery}
            {gallery}
          </div>
        </div>
        <div
          className="home-usage"
          style={{
            backgroundColor: this.props.theme.siteVariables?.colorScheme.brand.background6,
            color: this.props.theme.siteVariables?.colorScheme.brand.foreground6,
          }}
        >
          {storageMessage}
          {storageAction}
          &#160;&#160;
          <a
            href="https://silver-guide-3a7f4789.pages.github.io/docs/"
            className="home-header-docsLink"
            target="_blank"
            rel="noreferrer noopener"
          >
            Docs
          </a>{" "}
          and{" "}
          <a
            href="https://github.com/mojang/minecraft-creator-tools-internal"
            className="home-header-docsLink"
            target="_blank"
            rel="noreferrer noopener"
          >
            more info
          </a>
        </div>
        <div
          className="home-legal"
          style={{
            backgroundColor: this.props.theme.siteVariables?.colorScheme.brand.background6,
            color: this.props.theme.siteVariables?.colorScheme.brand.foreground6,
          }}
        >
          {constants.version}. {constants.disclaimer} {constants.copyright}
        </div>
      </div>
    );
  }
}
