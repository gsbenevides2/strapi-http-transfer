import {
  getAuthSourceData,
  getAuthTargetData,
} from "@/operations/transfer/utils.ts";
import { optionChoser } from "@/utils/optionChoser.ts";
import { downloadContentManagerData } from "@/content-manager/download.ts";
import type { AuthenticationData } from "@/authentication/retriveData.ts";
import type {
  IntermediateFileData,
  IntermediateFolderData,
} from "@/media-center/types.ts";
import { getFilesOfFolder, makeFolderRequest } from "@/media-center/utils.ts";
import { USER_AGENT } from "@/constants.ts";
import console from "node:console";
import process from "node:process";
import fs from "node:fs";
import mime from "mime";
import { Buffer } from "node:buffer";
import { deepDeleteStrapiIdForComponents } from "@/content-manager/utils.ts";

const ENTRY_TYPE_OPTIONS = {
  SINGLE: 0,
  COLLECTION: 1,
} as const;

const ENTRY_TYPE_LABELS = ["Single type", "Collection type"] as const;

interface AssetReference {
  id: number;
  documentId?: string;
  url?: string;
  hash?: string;
  name?: string;
  folderPath?: string;
}

/**
 * Downloads folder structure without downloading files
 */
async function getFolderStructure(
  authenticationData: AuthenticationData,
  parentId?: string,
  path?: string
): Promise<IntermediateFolderData[]> {
  let currentPage = 1;
  const pageSize = 100;
  const folders: IntermediateFolderData[] = [];

  while (true) {
    const folderData = await makeFolderRequest(
      authenticationData,
      parentId,
      path,
      currentPage,
      pageSize
    );

    for (const folderItem of folderData.data) {
      let childrenFolders: IntermediateFolderData[] = [];

      if (folderItem.children.count > 0) {
        childrenFolders = await getFolderStructure(
          authenticationData,
          folderItem.id.toString(),
          folderItem.path
        );
      }

      folders.push({
        name: folderItem.name,
        path: folderItem.path,
        id: folderItem.id,
        pathId: folderItem.pathId,
        hasChildrenFolders: folderItem.children.count > 0,
        childrenFolders: childrenFolders,
        files: [],
      });
    }

    if (folderData.data.length < pageSize) {
      break;
    }
    currentPage++;
  }

  return folders;
}

/**
 * Gets the complete folder tree structure
 */
async function getAllFolderStructure(
  authenticationData: AuthenticationData
): Promise<IntermediateFolderData> {
  const subFolders = await getFolderStructure(authenticationData);

  return {
    name: "root",
    path: "/",
    id: -1,
    pathId: 0,
    hasChildrenFolders: subFolders.length > 0,
    childrenFolders: subFolders,
    files: [],
  };
}

/**
 * Parses a folderPath to extract folder names hierarchy
 */
function parseFolderPath(
  folderPath: string,
  folderTree: IntermediateFolderData
): string[] {
  if (folderPath === "/" || !folderPath) {
    return [];
  }

  const pathParts = folderPath.split("/").filter(Boolean);
  const folderNames: string[] = [];

  function traverseTree(
    folders: IntermediateFolderData[],
    remainingParts: string[],
    currentPath: string
  ): void {
    if (remainingParts.length === 0) return;

    const nextPart = remainingParts[0];
    const testPath =
      currentPath === "/" ? `/${nextPart}` : `${currentPath}/${nextPart}`;

    for (const folder of folders) {
      if (folder.path === testPath) {
        folderNames.push(folder.name);
        if (remainingParts.length > 1) {
          traverseTree(
            folder.childrenFolders,
            remainingParts.slice(1),
            testPath
          );
        }
        return;
      }
    }
  }

  traverseTree(folderTree.childrenFolders, pathParts, "");
  return folderNames;
}

/**
 * Finds or creates a folder in destination based on name hierarchy
 */
async function mapAndEnsureFolderPath(
  folderNames: string[],
  destFolderTree: IntermediateFolderData,
  destAuth: AuthenticationData
): Promise<{ folderPath: string; folderId?: number }> {
  if (folderNames.length === 0) {
    return { folderPath: "/", folderId: undefined };
  }

  let currentFolders = destFolderTree.childrenFolders;
  let currentPath = "";
  let currentParentId: number | undefined = undefined;

  for (let i = 0; i < folderNames.length; i++) {
    const folderName = folderNames[i];
    let found = false;

    for (const folder of currentFolders) {
      if (folder.name === folderName) {
        currentPath = folder.path;
        currentParentId = folder.id;
        currentFolders = folder.childrenFolders;
        found = true;
        break;
      }
    }

    if (!found) {
      console.log(`Creating folder "${folderName}" in destination...`);
      const url = new URL("/upload/folders", destAuth.endpoint);
      const headers = new Headers();
      headers.append("Authorization", `Bearer ${destAuth.jwtToken}`);
      headers.append("User-Agent", USER_AGENT);
      headers.append("Content-Type", "application/json");

      const body = { name: folderName, parent: currentParentId };

      const response = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const result = (await response.json()) as {
        data: { id: number; path: string };
      };
      currentPath = result.data.path;
      currentParentId = result.data.id;

      const newFolder: IntermediateFolderData = {
        name: folderName || "",
        path: currentPath,
        id: result.data.id,
        pathId: 0,
        hasChildrenFolders: false,
        childrenFolders: [],
        files: [],
      };
      currentFolders.push(newFolder);
      currentFolders = newFolder.childrenFolders;

      console.log(`✓ Folder created: ${currentPath}`);
    }
  }

  return { folderPath: currentPath, folderId: currentParentId };
}

/**
 * Checks if a file exists in the destination
 */
async function checkFileExists(
  authenticationData: AuthenticationData,
  fileName: string,
  folderPath: string
): Promise<{ exists: boolean; fileId?: number; file?: IntermediateFileData }> {
  try {
    const files = await getFilesOfFolder(authenticationData, folderPath);
    const existingFile = files.find((f) => f.name === fileName);

    if (existingFile) {
      return { exists: true, fileId: existingFile.id, file: existingFile };
    }

    return { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * Downloads an asset file from the source
 */
async function downloadAsset(
  assetUrl: string,
  destinationPath: string
): Promise<void> {
  const headers = new Headers();
  headers.append("User-Agent", USER_AGENT);
  const response = await fetch(assetUrl, { headers });
  const blob = await response.arrayBuffer();
  await fs.writeFileSync(destinationPath, Buffer.from(blob));
}

/**
 * Uploads a file to the destination
 */
async function uploadAsset(
  authenticationData: AuthenticationData,
  localPath: string,
  fileName: string,
  folderId?: number,
  fileReplacementId?: number
): Promise<number> {
  const url = new URL("/upload", authenticationData.endpoint);
  if (fileReplacementId) {
    url.searchParams.set("id", fileReplacementId.toString());
  }

  const headers = new Headers();
  headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
  headers.append("User-Agent", USER_AGENT);

  const body = new FormData();
  const fileContent = fs.readFileSync(localPath);
  const blob = new Blob([fileContent], {
    type: mime.getType(fileName) ?? undefined,
  });

  body.append("files", blob);
  body.append("fileInfo", JSON.stringify({ folder: folderId, name: fileName }));

  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to upload asset: ${response.status} - ${errorText}`
    );
  }

  const responseJson = await response.json();

  // When replacing (with ?id=), Strapi returns a single object instead of array
  if (fileReplacementId) {
    if (Array.isArray(responseJson) && responseJson[0]) {
      return responseJson[0].id;
    }
    // Single object response
    if (
      responseJson &&
      typeof responseJson === "object" &&
      "id" in responseJson
    ) {
      return (responseJson as { id: number }).id;
    }
    // If the ID didn't change, return the replacement ID
    return fileReplacementId;
  }

  // Normal upload (no replacement)
  const responseArray = responseJson as Array<{ id: number }>;
  if (!responseArray[0]) {
    throw new Error("Failed to upload asset - no ID returned");
  }
  return responseArray[0].id;
}

/**
 * Extracts all asset references from a document (recursively)
 */
function extractAssetsFromDocument(
  document: Record<string, unknown>
): AssetReference[] {
  const assets: AssetReference[] = [];

  function traverse(obj: unknown) {
    if (typeof obj !== "object" || obj === null) {
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item) => traverse(item));
      return;
    }

    const keys = Object.keys(obj);
    const imageKeys = ["id", "documentId", "url", "hash"];
    const isImageObj =
      imageKeys.some((key) => keys.includes(key)) && keys.includes("id");

    if (isImageObj) {
      assets.push(obj as AssetReference);
      return;
    }

    for (const key of keys) {
      traverse((obj as Record<string, unknown>)[key]);
    }
  }

  traverse(document);
  return assets;
}

/**
 * Replaces asset IDs in a document with new IDs from destination
 */
function replaceAssetIds(
  document: Record<string, unknown>,
  assetMapping: Map<number, number>
): Record<string, unknown> {
  function traverse(obj: unknown): unknown {
    if (typeof obj !== "object" || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => traverse(item));
    }

    const keys = Object.keys(obj);
    const imageKeys = ["id", "documentId", "url", "hash"];
    const isImageObj =
      imageKeys.some((key) => keys.includes(key)) && keys.includes("id");

    if (isImageObj) {
      const oldId = (obj as Record<string, unknown>)["id"] as number;
      const newId = assetMapping.get(oldId);

      if (newId) {
        return { id: newId };
      }
    }

    const newObj: Record<string, unknown> = {};
    for (const key of keys) {
      newObj[key] = traverse((obj as Record<string, unknown>)[key]);
    }
    return newObj;
  }

  return traverse(document) as Record<string, unknown>;
}

/**
 * Transfers assets from source to destination with folder mapping
 */
async function transferAssets(
  sourceAuth: AuthenticationData,
  destinationAuth: AuthenticationData,
  assets: AssetReference[],
  sourceFolderTree: IntermediateFolderData,
  destFolderTree: IntermediateFolderData
): Promise<Map<number, number>> {
  let overwriteAlways = false;
  const assetMapping = new Map<number, number>();

  if (assets.length === 0) {
    console.log("No assets to transfer");
    return assetMapping;
  }

  console.log(`\nFound ${assets.length} asset(s) to transfer`);

  if (!fs.existsSync("assets")) {
    fs.mkdirSync("assets", { recursive: true });
  }

  for (const asset of assets) {
    const assetUrl = asset.url || "";
    const assetName = asset.name || `asset-${asset.id}`;
    const sourceFolderPath = asset.folderPath || "/";

    console.log(`\nProcessing asset: ${assetName}`);
    console.log(`Source folder: ${sourceFolderPath}`);

    const folderNames = parseFolderPath(sourceFolderPath, sourceFolderTree);
    console.log(
      `Folder hierarchy: ${
        folderNames.length > 0 ? folderNames.join(" > ") : "root"
      }`
    );

    const { folderPath: destFolderPath, folderId } =
      await mapAndEnsureFolderPath(
        folderNames,
        destFolderTree,
        destinationAuth
      );
    console.log(`Destination folder: ${destFolderPath}`);

    const { exists, fileId } = await checkFileExists(
      destinationAuth,
      assetName,
      destFolderPath
    );

    let fileReplacementId: number | undefined = undefined;

    if (exists && fileId) {
      if (overwriteAlways) {
        console.log(`Using existing asset (ID: ${fileId})`);
        assetMapping.set(asset.id, fileId);
        continue;
      } else {
        console.log(`⚠️  Asset "${assetName}" already exists in destination`);
        const options = [
          "Use existing asset(One Only)",
          "Use existing asset(Always)",
          "Overwrite with new asset",
        ];
        const choice = await optionChoser(options);
        if (choice === 1) {
          overwriteAlways = true;
        }
        if (choice === 0 || choice === 1) {
          console.log(`Using existing asset (ID: ${fileId})`);
          assetMapping.set(asset.id, fileId);
          continue;
        }

        // If overwrite, use the existing file ID for replacement
        console.log("Overwriting asset...");
        fileReplacementId = fileId;
      }
    }

    const localPath = `assets/transfer-${asset.id}`;
    console.log(`Downloading asset from source...`);

    const fullUrl = assetUrl.startsWith("http")
      ? assetUrl
      : new URL(assetUrl, sourceAuth.endpoint).toString();

    await downloadAsset(fullUrl, localPath);
    console.log(`✓ Asset downloaded`);

    console.log(`Uploading asset to destination...`);
    const newFileId = await uploadAsset(
      destinationAuth,
      localPath,
      assetName,
      folderId,
      fileReplacementId
    );
    console.log(`✓ Asset uploaded (ID: ${newFileId})`);

    assetMapping.set(asset.id, newFileId);

    fs.unlinkSync(localPath);
  }

  return assetMapping;
}

/**
 * Uploads a document to the destination
 */
async function uploadDocument(
  authenticationData: AuthenticationData,
  entry: string,
  document: Record<string, unknown>,
  isSingleType: boolean
): Promise<boolean> {
  const typeFull = `api::${entry}.${entry}`;
  const urlPath = isSingleType
    ? `/content-manager/single-types/${typeFull}/actions/publish`
    : `/content-manager/collection-types/${typeFull}/actions/publish`;

  const url = new URL(urlPath, authenticationData.endpoint);
  const headers = new Headers();
  headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
  headers.append("User-Agent", USER_AGENT);
  headers.append("Content-Type", "application/json");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(document),
  });

  return response.ok;
}

export async function documentTransfer(): Promise<void> {
  // 1. Get authenticated data source
  const dataSource = await getAuthSourceData();

  // 2. Download source content data
  console.log("Retrieving data from source...");
  const sourceData = await downloadContentManagerData(dataSource);

  // 3. Select entry type (single or collection)
  console.log("\n=== SOURCE SELECTION ===");
  console.log("\nIs the document a single type or collection type?");
  const entryTypeChoice = await optionChoser([...ENTRY_TYPE_LABELS]);
  const isSingleType = entryTypeChoice === ENTRY_TYPE_OPTIONS.SINGLE;

  // 4. Select source entry
  const availableSourceEntries = isSingleType
    ? dataSource.schema.uniqueEntries
    : dataSource.schema.multipleEntries;

  console.log("\nPlease select the source entry:");
  const sourceEntryChoice = await optionChoser(availableSourceEntries);
  const selectedSourceEntry = availableSourceEntries[sourceEntryChoice];
  console.log(`Selected source entry: ${selectedSourceEntry}`);

  if (!selectedSourceEntry) {
    console.error("Error: No entry found for the selected entry");
    process.exit(1);
  }

  // 5. Select source document
  let sourceDocument: Record<string, unknown>;

  if (isSingleType) {
    const document =
      sourceData.singleTypes[
        selectedSourceEntry as keyof typeof sourceData.singleTypes
      ];
    if (!document) {
      console.error("Error: No document found for the selected entry");
      process.exit(1);
    }
    sourceDocument = document as Record<string, unknown>;
  } else {
    const documents = sourceData.collectionTypes[
      selectedSourceEntry as keyof typeof sourceData.collectionTypes
    ] as { title: string }[];

    if (!documents || documents.length === 0) {
      console.error("Error: No documents found for the selected entry");
      process.exit(1);
    }

    console.log("\nPlease select the source document:");
    const documentTitles = documents.map((doc) => doc.title);
    const documentChoice = await optionChoser(documentTitles);
    sourceDocument = documents[documentChoice] as Record<string, unknown>;
    console.log(`Selected source document: ${documentTitles[documentChoice]}`);
  }

  // 6. Get authenticated data destination
  const dataDestination = await getAuthTargetData();

  // 7. Download destination content data
  console.log("\nRetrieving data from destination...");

  // 8. Display transfer configuration summary
  console.log("\n" + "=".repeat(50));
  console.log("✓ Document transfer configuration completed!");
  console.log("=".repeat(50));
  console.log(`\n📋 Transfer Configuration:`);
  console.log(`  Source Entry:       ${selectedSourceEntry}`);
  console.log(
    `  Entry Type:         ${isSingleType ? "Single Type" : "Collection Type"}`
  );
  console.log(`  Destination:        Same entry type in destination instance`);
  console.log("\n" + "=".repeat(50) + "\n");

  // 9. Download folder structures
  console.log("\n" + "=".repeat(50));
  console.log("FOLDER STRUCTURE MAPPING");
  console.log("=".repeat(50));

  console.log("\nRetrieving folder structure from source...");
  const sourceFolderTree = await getAllFolderStructure(dataSource);
  console.log(`✓ Source folder structure loaded`);

  console.log("\nRetrieving folder structure from destination...");
  const destFolderTree = await getAllFolderStructure(dataDestination);
  console.log(`✓ Destination folder structure loaded`);

  // 10. Extract and transfer assets
  console.log("\n" + "=".repeat(50));
  console.log("ASSET TRANSFER");
  console.log("=".repeat(50));

  const assets = extractAssetsFromDocument(sourceDocument);
  const assetMapping = await transferAssets(
    dataSource,
    dataDestination,
    assets,
    sourceFolderTree,
    destFolderTree
  );

  console.log(`\n✓ Assets transferred successfully`);

  // 11. Prepare document for transfer
  console.log("\nPreparing document for transfer...");
  let transferDocument = { ...sourceDocument };

  // Clean document data (remove Strapi IDs)
  transferDocument = deepDeleteStrapiIdForComponents(
    transferDocument
  ) as Record<string, unknown>;

  // Replace asset IDs with new ones from destination
  transferDocument = replaceAssetIds(transferDocument, assetMapping);

  console.log("✓ Document prepared");

  // 12. Upload document to destination
  console.log("\n" + "=".repeat(50));
  console.log("UPLOADING DOCUMENT");
  console.log("=".repeat(50) + "\n");

  console.log("Uploading document to destination...");
  const success = await uploadDocument(
    dataDestination,
    selectedSourceEntry,
    transferDocument,
    isSingleType
  );

  if (!success) {
    console.error("✗ Failed to upload document");
    process.exit(1);
  }

  console.log("✓ Document uploaded successfully");

  // 13. Final summary
  console.log("\n" + "=".repeat(50));
  console.log("🎉 DOCUMENT TRANSFER COMPLETED SUCCESSFULLY!");
  console.log("=".repeat(50));
  console.log(`\n📊 Transfer Summary:`);
  console.log(`  Entry:              ${selectedSourceEntry}`);
  console.log(
    `  Type:               ${isSingleType ? "Single Type" : "Collection Type"}`
  );
  console.log(`  Assets transferred: ${assetMapping.size}`);
  console.log(`  Status:             Published in destination`);
  console.log("\n" + "=".repeat(50) + "\n");
}
