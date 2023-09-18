import { expect, assert } from "chai";
import Carto from "../app/Carto";
import Project, { ProjectAutoDeploymentMode } from "../app/Project";
import CartoApp, { HostType } from "../app/CartoApp";
import DedicatedServerManager from "../local/DedicatedServerManager";
import Status from "../app/Status";
import NodeStorage from "../local/NodeStorage";
import Database from "../minecraft/Database";
import LocalEnvironment from "../local/LocalEnvironment";
import ProjectInfoSet, { ProjectInfoSuite } from "../info/ProjectInfoSet";
import IFolder from "../storage/IFolder";
import StorageUtilities from "../storage/StorageUtilities";
import ProjectExporter from "../app/ProjectExporter";
import { IWorldSettings } from "../minecraft/IWorldSettings";
import { GameType, Generator } from "../minecraft/WorldLevelDat";
import * as fs from "fs";

CartoApp.hostType = HostType.testLocal;

let carto: Carto | undefined = undefined;
let localEnv: LocalEnvironment | undefined = undefined;

let scenariosFolder: IFolder | undefined = undefined;

let resultsFolder: IFolder | undefined = undefined;

localEnv = new LocalEnvironment(false);

let dsm: DedicatedServerManager | undefined = undefined;

(async () => {
  CartoApp.localFolderExists = _localFolderExists;
  CartoApp.ensureLocalFolder = _ensureLocalFolder;

  const scenariosStorage = new NodeStorage(
    NodeStorage.ensureEndsWithDelimiter(__dirname) + "/../../test/",
    "scenarios"
  );

  scenariosFolder = scenariosStorage.rootFolder;

  await scenariosFolder.ensureExists();

  const resultsStorage = new NodeStorage(NodeStorage.ensureEndsWithDelimiter(__dirname) + "/../../test/", "results");

  resultsFolder = resultsStorage.rootFolder;

  await resultsFolder.ensureExists();

  CartoApp.prefsStorage = new NodeStorage(
    localEnv.utilities.testWorkingPath + "prefs" + NodeStorage.folderDelimiter,
    ""
  );

  CartoApp.projectsStorage = new NodeStorage(
    localEnv.utilities.testWorkingPath + "projects" + NodeStorage.folderDelimiter,
    ""
  );

  CartoApp.packStorage = new NodeStorage(
    localEnv.utilities.testWorkingPath + "packs" + NodeStorage.folderDelimiter,
    ""
  );

  CartoApp.worldStorage = new NodeStorage(
    localEnv.utilities.testWorkingPath + "worlds" + NodeStorage.folderDelimiter,
    ""
  );

  CartoApp.deploymentStorage = new NodeStorage(
    localEnv.utilities.testWorkingPath + "deployment" + NodeStorage.folderDelimiter,
    ""
  );
  CartoApp.workingStorage = new NodeStorage(
    localEnv.utilities.testWorkingPath + "working" + NodeStorage.folderDelimiter,
    ""
  );

  const coreStorage = new NodeStorage(__dirname + "/../../public/data/content/", "");
  Database.contentFolder = coreStorage.rootFolder;

  await CartoApp.init();

  carto = CartoApp.carto;

  if (!carto) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  dsm = new DedicatedServerManager(localEnv, carto);

  await carto.load();

  Database.local = localEnv.utilities;
  carto.local = localEnv.utilities;

  carto.onStatusAdded.subscribe(handleStatusAdded);

  run();
})();

function handleStatusAdded(carto: Carto, status: Status) {
  console.log(status.message);
}

function _ensureLocalFolder(path: string) {
  const ls = new NodeStorage(path, "");

  return ls.rootFolder;
}

async function _localFolderExists(path: string) {
  const ls = new NodeStorage(path, "");

  return await ls.rootFolder.exists();
}

async function _loadProject(name: string) {
  if (!carto || !scenariosFolder || !resultsFolder) {
    assert.fail("Not properly initialized");
  }

  const project = new Project(carto, name, null);

  project.autoDeploymentMode = ProjectAutoDeploymentMode.noAutoDeployment;
  project.localFolderPath = __dirname + "/../../../tests/" + name + "/";

  await project.loadFolderStructure();
  await project.inferProjectItemsFromFiles();

  return project;
}

function removeResultFolder(scenarioName: string) {
  if (resultsFolder) {
    const path =
      StorageUtilities.ensureEndsWithDelimiter(resultsFolder.fullPath) +
      StorageUtilities.ensureEndsWithDelimiter(scenarioName);
    if (fs.existsSync(path))
      // @ts-ignore
      fs.rmSync(path, {
        recursive: true,
      });
  }
}

describe("simple", async () => {
  it("has expected structure", async () => {
    const project = await _loadProject("simple");

    expect(project.items.length).to.equal(5);
  });

  it("report file matches", async () => {
    const project = await _loadProject("simple");

    const pis = new ProjectInfoSet(project, ProjectInfoSuite.all, ["SCHM"]); // don't do schema tests as results may change via network'ed schema def changes over time.

    await pis.generateForProject();

    const dataObject = pis.getDataObject();

    await ensureJsonMatchesScenario(dataObject, "simple");
  });
});

describe("deployJs", async () => {
  before((done) => {
    removeResultFolder("deployJs");
    done();
  });

  it("has expected structure", async () => {
    const project = await _loadProject("deployJs");

    expect(project.items.length).to.equal(4);
  });

  it("deploy outputs match", async () => {
    const project = await _loadProject("deployJs");

    if (!carto || !resultsFolder) {
      return;
    }

    const worldSettings: IWorldSettings = {
      generator: Generator.infinite,
      gameType: GameType.survival,
    };

    const resultsOutFolder = resultsFolder.ensureFolder("deployJs");
    await resultsOutFolder.ensureExists();

    await ProjectExporter.generateAndDeployProjectToWorld(carto, project, worldSettings, false, resultsOutFolder);

    await folderMatches("deployJs", ["level.dat", "level.dat_old"]); // exclude manifest.json from consideration since their uuids will be randomly generated and therefore always different
  });
});

async function folderMatches(scenarioName: string, excludeList?: string[]) {
  if (!scenariosFolder || !resultsFolder) {
    assert.fail("Not properly initialized");
  }

  const scenarioOutFolder = resultsFolder.ensureFolder(scenarioName);
  await scenarioOutFolder.ensureExists();

  const scenarioFolder = scenariosFolder.ensureFolder(scenarioName);

  const isEqual = await StorageUtilities.folderContentsEqual(scenarioFolder, scenarioOutFolder, excludeList, true);

  assert(
    isEqual.result,
    "Folder '" + scenarioFolder.fullPath + "' does not match for scenario '" + scenarioName + "'. " + isEqual.reason
  );
}

async function ensureJsonMatchesScenario(obj: object, scenarioName: string) {
  if (!scenariosFolder || !resultsFolder) {
    assert.fail("Not properly initialized");
  }

  const dataObjectStr = JSON.stringify(obj, null, 2);

  const scenarioOutFolder = resultsFolder.ensureFolder(scenarioName);
  await scenarioOutFolder.ensureExists();

  const outFile = scenarioOutFolder.ensureFile("report.json");
  outFile.setContent(dataObjectStr);
  await outFile.saveContent();

  const scenarioFile = scenariosFolder.ensureFolder(scenarioName).ensureFile("report.json");

  const exists = await scenarioFile.exists();

  assert(exists, "report.json file for scenario '" + scenarioName + "' does not exist.");

  const isEqual = await StorageUtilities.fileContentsEqual(scenarioFile, outFile, true);

  assert(
    isEqual,
    "report.json file '" + scenarioFile.fullPath + "' does not match for scenario '" + scenarioName + "'"
  );
}
