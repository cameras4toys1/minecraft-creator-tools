import { Component } from "react";
import ProjectEditor, { ProjectStatusAreaMode } from "./ProjectEditor";
import Home from "./Home";
import "./App.css";
import Carto from "./../app/Carto";
import Project, { ProjectErrorState } from "./../app/Project";
import IGalleryItem, { GalleryItemType } from "../app/IGalleryItem";
import IFolder from "../storage/IFolder";
import { GalleryProjectCommand } from "./ProjectGallery";
import Log from "../core/Log";
import { ProjectFocus, ProjectScriptLanguage } from "../app/IProjectData";
import CartoApp, { HostType } from "../app/CartoApp";
import StorageUtilities from "../storage/StorageUtilities";
import { ThemeInput } from "@fluentui/react-northstar";
import { CartoEditorViewMode } from "../app/ICartoData";
import ProjectItem from "../app/ProjectItem";
import ZipStorage from "../storage/ZipStorage";
import ProjectUtilities from "../app/ProjectUtilities";
import WebUtilities from "./WebUtilities";
import ProjectEditorUtilities, { ProjectEditorMode } from "./ProjectEditorUtilities";
import HttpStorage from "../storage/HttpStorage";

export enum NewProjectTemplateType {
  empty,
  gameTest,
}

export enum AppMode {
  home = 1,
  loading = 2,
  project = 3,
  codeToolbox = 4,
  projectReadOnly = 5,
  exporterTool = 6,
  remoteServerManager = 7,
  companion = 8,
  codeStartPage = 9,
  companionPlusBack = 10,
  companionMinusTitlebar = 11,
  codeStartPageForceNewProject = 12,
  codeLandingForceNewProject = 13,
  codeMinecraftView = 14,
  search = 15,
}

interface AppProps {
  theme: ThemeInput<any>;
  fileContentRetriever?: (func: () => Promise<any>) => void;
  saveAllRetriever?: (func: () => Promise<void>) => void;
}

interface AppState {
  carto?: Carto;
  mode: AppMode;
  isPersisted?: boolean;
  errorMessage?: string;
  activeProject: Project | null;
  selectedItem?: string;
  initialProjectEditorMode?: ProjectEditorMode;
  loadingMessage?: string;
  additionalLoadingMessage?: string;
}

export default class App extends Component<AppProps, AppState> {
  static instanceCount = 0;
  private _loadingMessage?: string;
  private _lastHashProcessed?: string;
  private _isMountedInternal: boolean = false;

  constructor(props: AppProps) {
    super(props);

    this._setProject = this._setProject.bind(this);
    this._handleNewProject = this._handleNewProject.bind(this);
    this._handleNewProjectFromFolder = this._handleNewProjectFromFolder.bind(this);
    this._handleNewProjectFromFolderInstance = this._handleNewProjectFromFolderInstance.bind(this);
    this._handleProjectSelected = this._handleProjectSelected.bind(this);
    this._handleCartoInit = this._handleCartoInit.bind(this);
    this._handlePersistenceUpgraded = this._handlePersistenceUpgraded.bind(this);
    this._newProjectFromGallery = this._newProjectFromGallery.bind(this);
    this._handleProjectGalleryCommand = this._handleProjectGalleryCommand.bind(this);
    this._handleHashChange = this._handleHashChange.bind(this);
    this._gitHubAddingMessageUpdater = this._gitHubAddingMessageUpdater.bind(this);
    this._getFileContent = this._getFileContent.bind(this);
    this._saveAll = this._saveAll.bind(this);
    this._handleItemChanged = this._handleItemChanged.bind(this);
    this._handleSaved = this._handleSaved.bind(this);
    this._doLog = this._doLog.bind(this);

    if (this.props.fileContentRetriever) {
      this.props.fileContentRetriever(this._getFileContent);
    }

    if (this.props.saveAllRetriever) {
      this.props.saveAllRetriever(this._saveAll);
    }

    if (CartoApp.carto === undefined) {
      this.state = {
        carto: undefined,
        mode: AppMode.loading,
        activeProject: null,
      };

      CartoApp.onInitialized.subscribe(this._handleCartoInit);

      // for a potential race condition where carto gets set right in between
      // initting of the state and registering the event.
      if (CartoApp.carto !== undefined) {
        this.state = {
          carto: CartoApp.carto,
          mode: AppMode.home,
          activeProject: null,
        };
      }
    } else {
      const stateFromUrl = this._getStateFromUrl();
      let initialAppMode = AppMode.home;

      if (stateFromUrl) {
        initialAppMode = stateFromUrl.mode;
      } else if (CartoApp.initialMode) {
        const mode = this._getModeFromString(CartoApp.initialMode);

        if (mode) {
          initialAppMode = mode;
        }
      }

      let selectedItem = undefined;

      if (
        (CartoApp.hostType === HostType.vsCodeWebWeb || CartoApp.hostType === HostType.vsCodeMainWeb) &&
        CartoApp.projectPath &&
        (initialAppMode === AppMode.codeToolbox || initialAppMode === AppMode.codeStartPage)
      ) {
        this._loadLocalStorageProject();
      } else if (CartoApp.modeParameter && CartoApp.modeParameter.startsWith("project/")) {
        const segments = CartoApp.modeParameter.split("/");

        if (segments.length === 2) {
          this._handleNewProject("Project", NewProjectTemplateType.gameTest);

          selectedItem = segments[1];
        }
      } else if (
        CartoApp.initialMode &&
        (CartoApp.modeParameter || CartoApp.initialMode === "info") &&
        CartoApp.projectPath
      ) {
        this._loadLocalStorageProject();
      }

      this.state = {
        carto: CartoApp.carto,
        mode: initialAppMode,
        selectedItem: selectedItem,
        activeProject: null,
      };

      if (!CartoApp.carto.isLoaded) {
        this.loadCarto(CartoApp.carto);
      }
    }
  }

  public async _saveAll() {
    if (this.state.activeProject) {
      await this.state.activeProject.save();
    }
  }

  public async _getFileContent() {
    return "{ }";
  }

  public async _loadLocalStorageProject() {
    let carto = this.state?.carto;

    if (!carto) {
      carto = CartoApp.carto;
    }

    if (!carto) {
      return;
    }

    let newProject = undefined;

    newProject = await carto.ensureProjectFromLocalStoragePath(CartoApp.projectPath);

    if (newProject) {
      let mode = this._getModeFromString(CartoApp.initialMode);

      if (mode === undefined) {
        mode = AppMode.home;
      }

      let selValue = this.state.selectedItem;

      if (CartoApp.modeParameter) {
        selValue = CartoApp.modeParameter;
      }

      this.initProject(newProject);

      await newProject.ensureProjectFolder();

      if (this.state) {
        const newState = {
          carto: carto,
          mode: mode,
          isPersisted: this.state.isPersisted,
          activeProject: newProject,
          selectedItem: selValue,
        };

        if (this._isMountedInternal) {
          this.setState(newState);
        } else {
          this.state = newState;
        }

        // Log.debug("Setting state with new project '" + newProject.name + "'");
      }
    }
  }

  public _handleItemChanged(project: Project, item: ProjectItem) {
    this._updateWindowTitle(this.state.mode, project);
  }

  public _handleSaved(project: Project, projectA: Project) {
    this._updateWindowTitle(this.state.mode, project);
  }

  public _getModeFromString(incomingMode: string | null | undefined) {
    switch (incomingMode) {
      case "home":
        return AppMode.home;

      case "project":
        return AppMode.project;

      case "projectitem":
        return AppMode.project;

      case "info":
        return AppMode.project;

      default:
        return undefined;
    }
  }

  private _handleHashChange() {
    const result = this._getStateFromUrl();

    if (result && this._isMountedInternal) {
      this.setState({
        carto: this.state.carto,
        mode: result.mode,
        isPersisted: this.state.isPersisted,
        loadingMessage: this.state.loadingMessage,
        additionalLoadingMessage: this.state.additionalLoadingMessage,
        activeProject: this.state.activeProject,
        selectedItem: result.selectedItem,
        initialProjectEditorMode: this.state.initialProjectEditorMode,
      });
    }
  }

  private async _handleCartoInit(source: Carto, instance: Carto) {
    if (this.state === undefined) {
      return;
    }

    await this.loadCarto(instance);
  }

  private async loadCarto(instance: Carto) {
    await instance.load();

    const isPersisted = await WebUtilities.getIsPersisted();

    const newState = this._getStateFromUrl();
    let nextMode = this.state.mode;

    if (newState) {
      nextMode = newState.mode;
    } else if (nextMode === AppMode.loading) {
      nextMode = AppMode.home;
    }

    this._updateWindowTitle(nextMode, this.state.activeProject);

    const newComponentState = {
      carto: CartoApp.carto,
      mode: nextMode,
      isPersisted: isPersisted,
      activeProject: this.state.activeProject,
    };

    if (this._isMountedInternal) {
      this.setState(newComponentState);
    } else {
      this.state = newComponentState;
    }
  }

  private _getStateFromUrl(): AppState | undefined {
    const hash = window.location.hash;
    const query = window.location.search;
    const queryVals: { [path: string]: string } = {};

    if (query) {
      const params = query.split("&");
      if (params.length > 0) {
        for (let i = 0; i < params.length; i++) {
          const firstEqual = params[i].indexOf("=");

          if (firstEqual > 0) {
            let key = params[i].substring(0, firstEqual);

            if (key.startsWith("?")) {
              key = key.substring(1);
            }

            queryVals[key] = params[i].substring(firstEqual + 1);
          }
        }
      }
    }

    if (queryVals["open"] !== undefined || queryVals["view"] !== undefined) {
      let openQuery = queryVals["view"];

      const updateContent = queryVals["updates"];

      if (queryVals["open"]) {
        openQuery = queryVals["open"];
      }

      const firstSlash = openQuery.indexOf("/");

      if (firstSlash > 1) {
        const openToken = openQuery.substring(0, firstSlash).toLowerCase();

        const openData = openQuery.substring(firstSlash + 1, openQuery.length);

        if (openToken === "gp") {
          this._ensureProjectFromGalleryId(openData, updateContent);
        }
      }
    }

    if (hash === "" && !this._lastHashProcessed) {
      this._lastHashProcessed = hash;
      return;
    }

    if (hash !== this._lastHashProcessed) {
      this._lastHashProcessed = hash;

      const firstSlash = hash.indexOf("/");

      if (firstSlash > 1) {
        const commandToken = hash.substring(1, firstSlash).toLowerCase();

        const commandData = hash.substring(firstSlash + 1, hash.length);

        if (commandToken === "project") {
          const segments = commandData.split("/");

          if (segments.length === 1) {
            this._handleNewProject("Project", NewProjectTemplateType.gameTest);

            return {
              mode: AppMode.project,
              activeProject: this.state?.activeProject,
              selectedItem: segments[0],
            };
          }
        } else if (commandToken === "toolbox") {
          const segments = commandData.split("/");

          if (segments.length === 1) {
            this._handleNewProject("Project", NewProjectTemplateType.gameTest);

            return {
              mode: AppMode.codeToolbox,
              activeProject: this.state?.activeProject,
              selectedItem: segments[0],
            };
          }
        } else if (commandToken === "codestartpage") {
          return {
            mode: AppMode.codeStartPage,
            activeProject: null,
          };
        } else if (commandToken === "codestartpageforcenewproject") {
          return {
            mode: AppMode.codeStartPageForceNewProject,
            activeProject: null,
          };
        } else if (commandToken === "codelandingforcenewproject") {
          return {
            mode: AppMode.codeLandingForceNewProject,
            activeProject: null,
          };
        } else if (commandToken === "companion") {
          return {
            mode: AppMode.companion,
            activeProject: null,
          };
        } else if (commandToken === "companionht") {
          return {
            mode: AppMode.companionMinusTitlebar,
            activeProject: null,
          };
        }
      } else {
        const commandToken = hash.substring(1).toLowerCase();
        const commandMode = this._getModeFromString(commandToken);

        if (commandMode) {
          return {
            mode: commandMode,
            activeProject: null,
          };
        }
      }
    }

    return undefined;
  }

  setHomeWithError(errorMessage: string) {
    this.setState({
      carto: CartoApp.carto,
      mode: AppMode.home,
      activeProject: null,
      isPersisted: this.state.isPersisted,
      errorMessage: errorMessage,
      initialProjectEditorMode: undefined,
    });
  }

  componentDidMount() {
    if (typeof window !== "undefined") {
      window.addEventListener("hashchange", this._handleHashChange, false);
    }

    this._isMountedInternal = true;
  }

  componentWillUnmount() {
    if (typeof window !== "undefined") {
      window.removeEventListener("hashchange", this._handleHashChange, false);
    }

    this._isMountedInternal = false;
  }

  private async _doLog(message: string) {
    let carto = this.state?.carto;

    if (!carto) {
      carto = CartoApp.carto;
    }

    this.setState({
      carto: carto,
      isPersisted: this.state.isPersisted,
      mode: AppMode.loading,
      loadingMessage: message,
    });
  }

  private async _handleNewProject(
    newProjectName: string,
    newProjectType: NewProjectTemplateType,
    newProjectCreator?: string,
    newProjectShortName?: string,
    newProjectPath?: string,
    additionalFilePath?: string,
    additionalFile?: File,
    editorStartMode?: ProjectEditorMode,
    startInReadOnly?: boolean
  ) {
    let carto = this.state?.carto;

    if (!carto) {
      carto = CartoApp.carto;
    }

    if (!carto) {
      return;
    }

    if (additionalFile && additionalFilePath && this.state && this._isMountedInternal) {
      this._doLog(
        "Loading " + newProjectName + (additionalFilePath.length > 2 ? " from " + additionalFilePath : "") + "..."
      );
    }

    let newProject = undefined;
    let focus = ProjectFocus.gameTests;

    if (newProjectType === NewProjectTemplateType.gameTest) {
      focus = ProjectFocus.gameTests;
    } else if (newProjectType === NewProjectTemplateType.empty) {
      focus = ProjectFocus.general;
    }

    if (newProjectPath === undefined) {
      newProject = await carto.createNewProject(
        newProjectName,
        newProjectPath,
        focus,
        true,
        ProjectScriptLanguage.typeScript
      );
    } else {
      newProject = await carto.ensureProjectFromFolder(newProjectPath, newProjectName, false);

      await newProject.ensureProjectFolder();

      newProject.focus = focus;

      await newProject.ensureDefaultItems();
    }

    if (additionalFile && additionalFilePath) {
      await ProjectEditorUtilities.addBrowserFile(newProject, additionalFilePath, additionalFile);
    }

    await newProject.save(true);
    await carto.save();

    this._updateWindowTitle(AppMode.project, newProject);

    let nextMode = this.state.mode;

    if (nextMode === AppMode.home || nextMode === AppMode.loading) {
      nextMode = AppMode.projectReadOnly;
    }

    this.initProject(newProject);

    if (this.state && this._isMountedInternal) {
      this.setState({
        carto: carto,
        mode: nextMode,
        isPersisted: this.state.isPersisted,
        activeProject: newProject,
        selectedItem: this.state.selectedItem,
        initialProjectEditorMode: editorStartMode,
      });
    }
  }

  private async _handleNewProjectFromFolder(folderPath: string) {
    if (this.state.carto === undefined) {
      return;
    }

    const newProject = await this.state.carto.ensureProjectFromFolder(folderPath);

    newProject.save();
    this.state.carto.save();

    this._setProject(newProject);
  }

  private _setProject(project: Project) {
    this._updateWindowTitle(AppMode.project, project);
    this.initProject(project);

    this.setState({
      mode: AppMode.project,
      isPersisted: this.state.isPersisted,
      activeProject: project,
    });
  }

  private async _handleNewProjectFromFolderInstance(folder: IFolder, name?: string, isDocumentationProject?: boolean) {
    if (this.state.carto === undefined) {
      return;
    }

    const newProject = new Project(this.state.carto, name ? name : folder.name, null);

    newProject.setProjectFolder(folder);

    if (isDocumentationProject) {
      await ProjectUtilities.prepareProjectForDocumentation(newProject);
    }

    await newProject.inferProjectItemsFromFiles();

    newProject.save();
    this.state.carto.save();

    this._setProject(newProject);
  }

  private async _ensureProjectFromGalleryId(galleryId: string, updateContent?: string) {
    if (this.state.carto === undefined) {
      return;
    }

    const gp = await this.state.carto.getGalleryProjectById(galleryId);

    if (gp === undefined) {
      this.setHomeWithError("We could not find a gallery project with an identifier of '" + galleryId + "' to open.");
      return;
    }

    this._ensureProjectFromGallery(gp, updateContent);
  }

  private async _ensureProjectFromGallery(project: IGalleryItem, updateContent?: string) {
    if (this.state === null || this.state.carto === undefined) {
      return;
    }

    this._ensureProjectFromGitHubTemplate(
      project.title,
      project.gitHubOwner,
      project.gitHubRepoName,
      false,
      project.gitHubBranch,
      project.gitHubFolder,
      project.fileList,
      project.id,
      project.type === GalleryItemType.codeSample ? project.id : undefined,
      updateContent
    );
  }

  private async _ensureProjectFromGitHubTemplate(
    title: string,
    gitHubOwner: string,
    gitHubRepoName: string,
    isReadOnly: boolean,
    gitHubBranch?: string,
    gitHubFolder?: string,
    fileList?: string[],
    projectId?: string,
    sampleId?: string,
    updateContent?: string
  ) {
    const carto = CartoApp.carto;

    if (this.state === null || carto === undefined) {
      return;
    }

    this._loadingMessage = "opening GitHub " + gitHubOwner + "/" + gitHubRepoName + "...";

    let newMode = AppMode.project;

    if (isReadOnly) {
      newMode = AppMode.projectReadOnly;
    }

    this._updateWindowTitle(AppMode.loading, null);

    this.setState({
      mode: AppMode.loading,
      activeProject: null,
      isPersisted: this.state.isPersisted,
      loadingMessage: this._loadingMessage,
      additionalLoadingMessage: undefined,
    });

    await carto.load();

    const projects = carto.projects;

    for (let i = 0; i < projects.length; i++) {
      const proj = projects[i];

      await proj.loadFromFile();

      if (
        proj.originalGitHubOwner === gitHubOwner &&
        proj.originalGitHubRepoName === gitHubRepoName &&
        proj.originalGitHubBranch === gitHubBranch &&
        proj.originalGitHubFolder === gitHubFolder &&
        updateContent === undefined
      ) {
        this._updateWindowTitle(newMode, proj);

        this.initProject(proj);

        this.setState({
          mode: newMode,
          isPersisted: this.state.isPersisted,
          activeProject: proj,
        });

        return;
      }
    }

    this._newProjectFromGitHubTemplate(
      title,
      gitHubOwner,
      gitHubRepoName,
      isReadOnly,
      gitHubBranch,
      gitHubFolder,
      fileList,
      projectId,
      sampleId,
      updateContent
    );
  }

  private async _newProjectFromGallery(project: IGalleryItem, name?: string, creator?: string, shortName?: string) {
    if (this.state === null || this.state.carto === undefined) {
      return;
    }

    this._newProjectFromGitHubTemplate(
      project.title,
      project.gitHubOwner,
      project.gitHubRepoName,
      false,
      project.gitHubBranch,
      project.gitHubFolder,
      project.fileList,
      project.id,
      project.type === GalleryItemType.codeSample || project.type === GalleryItemType.editorCodeSample
        ? project.id
        : undefined,
      undefined,
      name,
      creator,
      shortName,
      project.type
    );
  }

  private async _newProjectFromGitHubTemplate(
    title: string,
    gitHubOwner: string,
    gitHubRepoName: string,
    isReadOnly: boolean,
    gitHubBranch?: string,
    gitHubFolder?: string,
    fileList?: string[],
    galleryId?: string,
    sampleId?: string,
    updateContent?: string,
    suggestedName?: string,
    suggestedCreator?: string,
    suggestedShortName?: string,
    galleryType?: GalleryItemType
  ) {
    const carto = CartoApp.carto;

    if (this.state === null || carto === undefined) {
      return;
    }

    if (suggestedCreator === undefined) {
      suggestedCreator = carto.creator;
    }

    if (suggestedName && suggestedCreator && suggestedShortName === undefined) {
      suggestedShortName = ProjectUtilities.getSuggestedProjectShortName(suggestedCreator, suggestedName);
    }

    this._loadingMessage = "opening sample " + gitHubOwner + "/" + gitHubRepoName + "...";

    this._updateWindowTitle(AppMode.loading, null);

    this.setState({
      mode: AppMode.loading,
      activeProject: null,
      isPersisted: this.state.isPersisted,
      loadingMessage: this._loadingMessage,
      additionalLoadingMessage: undefined,
    });

    await carto.load();

    const operId = await carto.notifyOperationStarted("Creating new project from '" + title + "'");

    if (gitHubOwner !== undefined && gitHubRepoName !== undefined) {
      let gh = undefined;

      if (galleryType === GalleryItemType.entityType || galleryType === GalleryItemType.blockType) {
        gh = new HttpStorage(
          CartoApp.contentRoot + "res/samples/microsoft/minecraft-samples-main/addon_starter/start/"
        );
      } else {
        gh = new HttpStorage(
          CartoApp.contentRoot +
            "res/samples/" +
            gitHubOwner +
            "/" +
            gitHubRepoName +
            "-" +
            (gitHubBranch ? gitHubBranch : "main") +
            "/" +
            gitHubFolder
        ); //new GitHubStorage(carto.anonGitHub, gitHubRepoName, gitHubOwner, gitHubBranch, gitHubFolder);
      }
      let projName = suggestedName
        ? suggestedName
        : ProjectUtilities.getSuggestedProjectNameFromElements(galleryId, gitHubFolder, gitHubRepoName);

      const newProjectName = await carto.getNewProjectName(projName);

      let focus = ProjectFocus.general;

      if (galleryType === GalleryItemType.editorProject) {
        focus = ProjectFocus.editorExtension;
      } else if (galleryType === GalleryItemType.codeSample || galleryType === GalleryItemType.editorCodeSample) {
        focus = ProjectFocus.focusedCodeSnippet;
      }

      const newProject = await carto.createNewProject(newProjectName, undefined, focus, false);

      await gh.rootFolder.load();

      const rootFolder = await newProject.ensureProjectFolder();

      try {
        await StorageUtilities.syncFolderTo(
          gh.rootFolder,
          rootFolder,
          false,
          false,
          false,
          ["build", "node_modules", "/dist", "/.git", "/lib", "/out", "/node_modules"],
          undefined,
          this._gitHubAddingMessageUpdater
        );
      } catch (e: any) {
        this.setState({
          carto: this.state.carto,
          mode: AppMode.home,
          activeProject: this.state.activeProject,
          selectedItem: this.state.selectedItem,
          initialProjectEditorMode: this.state.initialProjectEditorMode,
          isPersisted: this.state.isPersisted,
          errorMessage: "Could not create a new project. " + e.toString(),
        });

        return;
      }

      newProject.originalGitHubOwner = gitHubOwner;
      newProject.originalFileList = fileList;
      newProject.originalGitHubRepoName = gitHubRepoName;
      newProject.originalGitHubBranch = gitHubBranch;
      newProject.originalGitHubFolder = gitHubFolder;
      newProject.originalGalleryId = galleryId;
      newProject.originalSampleId = sampleId;
      newProject.creator = suggestedCreator;
      newProject.shortName = suggestedShortName;

      if ((galleryType === GalleryItemType.entityType || galleryType === GalleryItemType.blockType) && galleryId) {
        const galleryProject = await carto.getGalleryProjectById(galleryId);

        if (galleryProject) {
          if (galleryType === GalleryItemType.entityType) {
            await ProjectUtilities.addEntityTypeFromGallery(newProject, galleryProject);
          } else if (galleryType === GalleryItemType.blockType) {
            await ProjectUtilities.addBlockTypeFromGallery(newProject, galleryProject);
          }
        }
      }

      if (sampleId !== undefined) {
        const snippet = ProjectUtilities.getSnippet(sampleId);

        Log.assertDefined(snippet, "Snippet " + sampleId + " could not be found.");

        if (snippet) {
          await ProjectUtilities.injectSnippet(newProject, snippet, galleryType === GalleryItemType.editorCodeSample);
        }
      }

      if (updateContent !== undefined && newProject.projectFolder !== null) {
        try {
          const zs = new ZipStorage();

          await zs.loadFromBase64(updateContent);

          if (zs.errorStatus) {
            this.setHomeWithError(
              "Error processing compressed content from URL." + (zs.errorMessage ? "Details: " + zs.errorMessage : "")
            );
            return;
          }

          await StorageUtilities.syncFolderTo(
            zs.rootFolder,
            newProject.projectFolder,
            false,
            false,
            false,
            ["package.json", "package.lock.json", "gulpfile.js", "just.config.ts"],
            ["*.ts", "*.js", "*.json"]
          );
        } catch (e) {
          this.setHomeWithError(
            "Could not process updated content from URL. Check to make sure your shared URL is valid. (" + e + ")"
          );
          return;
        }
      }

      await ProjectUtilities.processNewProject(newProject, suggestedShortName);

      await carto.save();

      this._setProject(newProject);
    }

    await carto.notifyOperationEnded(operId, "New project '" + title + "' created.  Have fun!");
  }

  private async _handlePersistenceUpgraded() {
    this.setState({
      mode: this.state.mode,
      carto: this.state.carto,
      isPersisted: true,
      activeProject: this.state.activeProject,
      selectedItem: this.state.selectedItem,
      loadingMessage: this.state.loadingMessage,
      additionalLoadingMessage: this.state.additionalLoadingMessage,
    });
  }

  private async _gitHubAddingMessageUpdater(additionalMessage: string) {
    let message = this.state.loadingMessage;

    if (!message) {
      message = "Loading.";
    }

    this.setState({
      mode: this.state.mode,
      carto: this.state.carto,
      isPersisted: this.state.isPersisted,
      activeProject: this.state.activeProject,
      selectedItem: this.state.selectedItem,
      loadingMessage: message,
      additionalLoadingMessage: additionalMessage,
    });
  }

  private initProject(newProject: Project) {
    newProject.onItemChanged.subscribe(this._handleItemChanged);
    newProject.onSaved.subscribe(this._handleSaved);
  }

  private _updateWindowTitle(newMode: AppMode, activeProject: Project | null) {
    let title = "Minecraft Creator Tools";

    switch (newMode) {
      case AppMode.exporterTool:
        title = "Export - " + title;
        break;

      case AppMode.project:
      case AppMode.projectReadOnly:
        if (activeProject !== null) {
          const projName = activeProject.loc.getTokenValueOrDefault(activeProject.name);
          title = projName + " - " + title;
        }
        break;

      case AppMode.loading:
        title = "Loading - " + title;
        break;
    }

    if (activeProject && activeProject.hasUnsavedChanges()) {
      title = "* " + title;
    }

    window.document.title = title;
  }

  private _handleProjectGalleryCommand(
    command: GalleryProjectCommand,
    project: IGalleryItem,
    name?: string,
    creator?: string,
    shortName?: string
  ) {
    switch (command) {
      case GalleryProjectCommand.newProject:
      case GalleryProjectCommand.projectSelect:
        this._newProjectFromGallery(project, name, creator, shortName);
        break;
      case GalleryProjectCommand.ensureProject:
        this._ensureProjectFromGallery(project);
        break;
      case GalleryProjectCommand.forkProject:
        alert("Forking projects is not implemented... yet.");
        break;
    }
  }

  private async _handleProjectSelected(project: Project) {
    await project.loadFromFile();

    this._updateWindowTitle(AppMode.project, project);

    this.initProject(project);

    this.setState({
      mode: AppMode.project,
      isPersisted: this.state.isPersisted,
      activeProject: project,
    });
  }

  private _handleModeChangeRequested = (newMode: AppMode) => {
    this._updateWindowTitle(newMode, this.state.activeProject);

    this.setState({
      mode: newMode,
      isPersisted: this.state.isPersisted,
    });
  };

  render() {
    let interior = <></>;

    if (this.state.carto === undefined) {
      return <div className="app-loading">Loading!</div>;
    }

    let top = <></>;
    let borderStr = "";
    let height = "100vh";
    let heightOffset = 0;

    if (this.state.mode === AppMode.loading) {
      let message = "loading...";

      let additionalLoadingMessage = "";

      if (this.state.loadingMessage !== undefined) {
        message = this.state.loadingMessage;
      }

      if (this.state.additionalLoadingMessage !== undefined) {
        additionalLoadingMessage = this.state.additionalLoadingMessage;
      }

      interior = (
        <div className="app-loadingArea" key="app-la">
          <div className="app-loading">{message}</div>
          <div className="app-subloading">{additionalLoadingMessage}</div>
        </div>
      );
    } else if (this.state.mode === AppMode.home) {
      interior = (
        <Home
          theme={this.props.theme}
          carto={this.state.carto}
          heightOffset={heightOffset}
          isPersisted={this.state.isPersisted}
          errorMessage={this.state.errorMessage}
          onLog={this._doLog}
          key="app-h"
          onSetProject={this._setProject}
          onPersistenceUpgraded={this._handlePersistenceUpgraded}
          onGalleryItemCommand={this._handleProjectGalleryCommand}
          onModeChangeRequested={this._handleModeChangeRequested}
          onNewProjectSelected={this._handleNewProject}
          onNewProjectFromFolderSelected={this._handleNewProjectFromFolder}
          onNewProjectFromFolderInstanceSelected={this._handleNewProjectFromFolderInstance}
          onProjectSelected={this._handleProjectSelected}
        />
      );
    } else if (this.state.activeProject !== null && CartoApp.initialMode === "projectitem") {
      interior = (
        <ProjectEditor
          carto={this.state.carto}
          theme={this.props.theme}
          hideMainToolbar={true}
          key="app-pe"
          statusAreaMode={ProjectStatusAreaMode.hidden}
          project={this.state.activeProject}
          selectedItem={this.state.selectedItem}
          viewMode={CartoEditorViewMode.mainFocus}
          mode={this.state.initialProjectEditorMode ? this.state.initialProjectEditorMode : undefined}
          readOnly={true}
          onModeChangeRequested={this._handleModeChangeRequested}
        />
      );
    } else if (this.state.activeProject !== null && CartoApp.initialMode === "info") {
      interior = (
        <ProjectEditor
          carto={this.state.carto}
          theme={this.props.theme}
          hideMainToolbar={true}
          key="app-pea"
          statusAreaMode={ProjectStatusAreaMode.hidden}
          project={this.state.activeProject}
          mode={ProjectEditorMode.inspector}
          viewMode={CartoEditorViewMode.mainFocus}
          readOnly={true}
          onModeChangeRequested={this._handleModeChangeRequested}
        />
      );
    } else if (this.state.activeProject !== null) {
      if (this.state.activeProject.errorState === ProjectErrorState.projectFolderOrFileDoesNotExist) {
        let error = "Could not find project data folder: ";

        if (this.state.activeProject.localFolderPath) {
          error += this.state.activeProject.localFolderPath;
        }

        error += ". It may not be available on this PC?";

        interior = (
          <Home
            theme={this.props.theme}
            carto={this.state.carto}
            heightOffset={heightOffset}
            errorMessage={error}
            onLog={this._doLog}
            key="app-hoa"
            onSetProject={this._setProject}
            onGalleryItemCommand={this._handleProjectGalleryCommand}
            onModeChangeRequested={this._handleModeChangeRequested}
            onNewProjectSelected={this._handleNewProject}
            onNewProjectFromFolderSelected={this._handleNewProjectFromFolder}
            onProjectSelected={this._handleProjectSelected}
          />
        );
      } else if (this.state.activeProject.originalSampleId) {
        // show main view (no sidebar) if it's a code sample.
        interior = (
          <ProjectEditor
            carto={this.state.carto}
            key="app-pec"
            theme={this.props.theme}
            viewMode={CartoEditorViewMode.mainFocus}
            project={this.state.activeProject}
            mode={this.state.initialProjectEditorMode ? this.state.initialProjectEditorMode : undefined}
            selectedItem={this.state.selectedItem}
            readOnly={true}
            onModeChangeRequested={this._handleModeChangeRequested}
          />
        );
      } else {
        interior = (
          <ProjectEditor
            carto={this.state.carto}
            theme={this.props.theme}
            key="app-pef"
            project={this.state.activeProject}
            mode={this.state.initialProjectEditorMode ? this.state.initialProjectEditorMode : undefined}
            selectedItem={this.state.selectedItem}
            readOnly={true}
            onModeChangeRequested={this._handleModeChangeRequested}
          />
        );
      }
    }

    return (
      <div
        style={{
          backgroundColor: this.props.theme.siteVariables?.colorScheme.brand.background1,
          color: this.props.theme.siteVariables?.colorScheme.brand.foreground1,
        }}
      >
        {top}
        <div
          className="app-editor"
          style={{
            minHeight: height,
            maxHeight: height,
            borderLeft: borderStr,
            borderRight: borderStr,
            borderBottom: borderStr,
          }}
        >
          {interior}
        </div>
      </div>
    );
  }
}
