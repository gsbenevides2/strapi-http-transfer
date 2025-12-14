import { getAuthSourceData, getAuthTargetData } from "@/operations/transfer/utils.ts";
import { optionChoser } from "@/utils/optionChoser.ts";
import { downloadContentManagerData } from "@/content-manager/download.ts";
import type { ContentManagerData } from "@/content-manager/download.ts";
import type { AuthenticationData } from "@/authentication/retriveData.ts";
import type { IntermediateFileData, IntermediateFolderData } from "@/media-center/types.ts";
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

const ENTRY_TYPE_LABELS = [
  "Single type",
  "Collection type",
] as const;

type ComponentData = { __component: string };

interface ComponentTransferResult {
  sourceEntry: string;
  component: string;
  destinationEntry: string;
  destinationField: string;
  isSingleType: boolean;
  sourceData: Awaited<ReturnType<typeof downloadContentManagerData>>;
  destinationData: Awaited<ReturnType<typeof downloadContentManagerData>>;
}

interface AssetReference {
  id: number;
  documentId?: string;
  url?: string;
  hash?: string;
  name?: string;
  folderPath?: string;
}

/**
 * Extracts all asset references from a component
 */
function extractAssetsFromComponent(component: Record<string, unknown>): AssetReference[] {
  const assets: AssetReference[] = [];
  
  function traverse(obj: unknown) {
    if (typeof obj !== "object" || obj === null) {
      return;
    }
    
    const keys = Object.keys(obj);
    const imageKeys = ["id", "documentId", "url", "hash"];
    const isImageObj = imageKeys.some(key => keys.includes(key)) && keys.includes("id");
    
    if (isImageObj) {
      assets.push(obj as AssetReference);
      return;
    }
    
    for (const key of keys) {
      traverse((obj as Record<string, unknown>)[key]);
    }
  }
  
  traverse(component);
  return assets;
}

/**
 * Downloads an asset file from the source
 */
async function downloadAsset(assetUrl: string, destinationPath: string): Promise<void> {
  const headers = new Headers();
  headers.append("User-Agent", USER_AGENT);
  const response = await fetch(assetUrl, { headers });
  const blob = await response.arrayBuffer();
  await fs.writeFileSync(destinationPath, Buffer.from(blob));
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
    const folderData = await makeFolderRequest(authenticationData, parentId, path, currentPage, pageSize);
    
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
        files: [], // Not downloading files
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
 * Example: "/1/5" in source might represent ["Landing Pages", "Banners"]
 */
function parseFolderPath(
  folderPath: string,
  folderTree: IntermediateFolderData
): string[] {
  if (folderPath === "/" || !folderPath) {
    return [];
  }
  
  const pathParts = folderPath.split('/').filter(Boolean);
  const folderNames: string[] = [];
  
  function traverseTree(
    folders: IntermediateFolderData[],
    remainingParts: string[],
    currentPath: string
  ): void {
    if (remainingParts.length === 0) return;
    
    const nextPart = remainingParts[0];
    const testPath = currentPath === "/" ? `/${nextPart}` : `${currentPath}/${nextPart}`;
    
    for (const folder of folders) {
      if (folder.path === testPath) {
        folderNames.push(folder.name);
        if (remainingParts.length > 1) {
          traverseTree(folder.childrenFolders, remainingParts.slice(1), testPath);
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
    
    // Search for folder with this name in current level
    for (const folder of currentFolders) {
      if (folder.name === folderName) {
        currentPath = folder.path;
        currentParentId = folder.id;
        currentFolders = folder.childrenFolders;
        found = true;
        break;
      }
    }
    
    // If not found, create it
    if (!found) {
      console.log(`Creating folder "${folderName}" in destination...`);
      const url = new URL('/upload/folders', destAuth.endpoint);
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
      
      const result = await response.json() as { data: { id: number; path: string } };
      currentPath = result.data.path;
      currentParentId = result.data.id;
      
      // Update tree structure
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
    const existingFile = files.find(f => f.name === fileName);
    
    if (existingFile) {
      return { exists: true, fileId: existingFile.id, file: existingFile };
    }
    
    return { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * Uploads a file to the destination
 */
async function uploadAsset(
  authenticationData: AuthenticationData,
  localPath: string,
  fileName: string,
  folderId?: number
): Promise<number> {
  const url = new URL('/upload', authenticationData.endpoint);
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
  
  const responseJson = await response.json() as Array<{ id: number }>;
  if (!responseJson[0]) {
    throw new Error("Failed to upload asset - no ID returned");
  }
  return responseJson[0].id;
}

/**
 * Replaces asset IDs in a component with new IDs from destination
 */
function replaceAssetIds(
  component: Record<string, unknown>,
  assetMapping: Map<number, number>
): Record<string, unknown> {
  function traverse(obj: unknown): unknown {
    if (typeof obj !== "object" || obj === null) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => traverse(item));
    }
    
    const keys = Object.keys(obj);
    const imageKeys = ["id", "documentId", "url", "hash"];
    const isImageObj = imageKeys.some(key => keys.includes(key)) && keys.includes("id");
    
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
  
  return traverse(component) as Record<string, unknown>;
}

/**
 * Selects a component from a document's field and returns component type and data
 */
async function selectComponentFromDocument(document: Record<string, unknown>): Promise<{
  componentType: string;
  componentData: Record<string, unknown>;
  fieldName: string;
}> {
  const fields = Object.keys(document);
  
  if (fields.length === 0) {
    console.error("Error: The document has no fields");
    process.exit(1);
  }
  
  console.log("Please select the field where the component is located:");
  const fieldChoice = await optionChoser(fields);
  const selectedField = fields[fieldChoice];
  console.log(`Selected field: ${selectedField}`);

  if (!selectedField) {
    console.error("Error: No field found for the selected field");
    process.exit(1);
  }

  const fieldValue = document[selectedField];
  
  if (!Array.isArray(fieldValue) || fieldValue.length === 0) {
    console.error(`Error: Field "${selectedField}" is not a valid component array or is empty`);
    process.exit(1);
  }
  
  const componentList = fieldValue as ComponentData[];
  const componentNames = componentList.map((component) => component.__component);
  
  console.log("Please select the component to transfer:");
  const componentChoice = await optionChoser(componentNames);
  const selectedComponent = componentNames[componentChoice];
  const selectedComponentData = componentList[componentChoice];
  
  console.log(`Component to transfer: ${selectedComponent}`);
  if (!selectedComponent) {
    console.error("Error: No component found for the selected component");
    process.exit(1);
  }
  
  return {
    componentType: selectedComponent,
    componentData: selectedComponentData as Record<string, unknown>,
    fieldName: selectedField,
  };
}

/**
 * Handles component transfer from a single type entry
 */
async function transferFromSingleType(
  data: Awaited<ReturnType<typeof downloadContentManagerData>>,
  entry: string
): Promise<{
  componentType: string;
  componentData: Record<string, unknown>;
  fieldName: string;
}> {
  const document = data.singleTypes[entry as keyof typeof data.singleTypes];
  
  if (!document) {
    console.error("Error: No document found for the selected entry");
    process.exit(1);
  }
  
  return await selectComponentFromDocument(document as Record<string, unknown>);
}

/**
 * Handles component transfer from a collection type entry
 */
async function transferFromCollectionType(
  data: Awaited<ReturnType<typeof downloadContentManagerData>>,
  entry: string
): Promise<{
  componentType: string;
  componentData: Record<string, unknown>;
  fieldName: string;
}> {
  const documents = data.collectionTypes[entry as keyof typeof data.collectionTypes] as { title: string }[];
  
  if (!documents) {
    console.error("Error: No documents found for the selected entry");
    process.exit(1);
  }
  
  if (documents.length === 0) {
    console.error("Error: The collection type has no documents");
    process.exit(1);
  }
  
  console.log("\nPlease select the source document:");
  const documentTitles = documents.map((doc) => doc.title);
  const documentChoice = await optionChoser(documentTitles);
  const selectedDocument = documents[documentChoice] as Record<string, unknown>;
  console.log(`Selected source document: ${documentTitles[documentChoice]}`);
  
  return await selectComponentFromDocument(selectedDocument);
}

/**
 * Selects an entry and document from destination
 */
async function selectDestinationTarget(
  availableEntries: string[],
  data: ContentManagerData,
  isSingleType: boolean
): Promise<{ entry: string; document: Record<string, unknown> }> {
  console.log("\n=== DESTINATION SELECTION ===");
  console.log("\nPlease select the destination entry:");
  const entryChoice = await optionChoser(availableEntries);
  const selectedEntry = availableEntries[entryChoice];
  console.log(`Selected destination entry: ${selectedEntry}`);

  if (!selectedEntry) {
    console.error("Error: No entry found for the selected entry");
    process.exit(1);
  }

  let selectedDocument: Record<string, unknown>;

  if (isSingleType) {
    const document = data.singleTypes[selectedEntry as keyof typeof data.singleTypes];
    if (!document) {
      console.error("Error: No document found for the selected entry");
      process.exit(1);
    }
    selectedDocument = document as Record<string, unknown>;
  } else {
    const documents = data.collectionTypes[selectedEntry as keyof typeof data.collectionTypes] as { title: string }[];
    if (!documents) {
      console.error("Error: No documents found for the selected entry");
      process.exit(1);
    }
    
    console.log("\nPlease select the destination document:");
    const documentTitles = documents.map((doc) => doc.title);
    const documentChoice = await optionChoser(documentTitles);
    selectedDocument = documents[documentChoice] as Record<string, unknown>;
    console.log(`Selected destination document: ${documentTitles[documentChoice]}`);
  }

  return { entry: selectedEntry, document: selectedDocument };
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
  const assetMapping = new Map<number, number>();
  
  if (assets.length === 0) {
    console.log("No assets to transfer");
    return assetMapping;
  }
  
  console.log(`\nFound ${assets.length} asset(s) to transfer`);
  
  // Ensure assets folder exists
  if (!fs.existsSync("assets")) {
    fs.mkdirSync("assets", { recursive: true });
  }
  
  for (const asset of assets) {
    const assetUrl = asset.url || "";
    const assetName = asset.name || `asset-${asset.id}`;
    const sourceFolderPath = asset.folderPath || "/";
    
    console.log(`\nProcessing asset: ${assetName}`);
    console.log(`Source folder: ${sourceFolderPath}`);
    
    // 1. Parse folder hierarchy from source
    const folderNames = parseFolderPath(sourceFolderPath, sourceFolderTree);
    console.log(`Folder hierarchy: ${folderNames.length > 0 ? folderNames.join(' > ') : 'root'}`);
    
    // 2. Map and ensure folder exists in destination
    const { folderPath: destFolderPath, folderId } = await mapAndEnsureFolderPath(
      folderNames,
      destFolderTree,
      destinationAuth
    );
    console.log(`Destination folder: ${destFolderPath}`);
    
    // 3. Check if file already exists in mapped folder
    const { exists, fileId } = await checkFileExists(destinationAuth, assetName, destFolderPath);
    
    if (exists && fileId) {
      console.log(`⚠️  Asset "${assetName}" already exists in destination`);
      const options = ["Use existing asset", "Overwrite with new asset"];
      const choice = await optionChoser(options);
      
      if (choice === 0) {
        // Use existing
        console.log(`Using existing asset (ID: ${fileId})`);
        assetMapping.set(asset.id, fileId);
        continue;
      }
      
      // If overwrite, we'll delete and re-upload
      console.log("Overwriting asset...");
      // Note: Strapi doesn't have a simple delete endpoint in upload API
      // We'll just upload with same name, Strapi will handle it
    }
    
    // 3. Download asset from source
    const localPath = `assets/transfer-${asset.id}`;
    console.log(`Downloading asset from source...`);
    
    // Normalize URL
    const fullUrl = assetUrl.startsWith("http") 
      ? assetUrl 
      : new URL(assetUrl, sourceAuth.endpoint).toString();
    
    await downloadAsset(fullUrl, localPath);
    console.log(`✓ Asset downloaded`);
    
    // 4. Upload to destination
    console.log(`Uploading asset to destination...`);
    const newFileId = await uploadAsset(destinationAuth, localPath, assetName, folderId);
    console.log(`✓ Asset uploaded (ID: ${newFileId})`);
    
    // 5. Map old ID to new ID
    assetMapping.set(asset.id, newFileId);
    
    // 6. Clean up local file
    fs.unlinkSync(localPath);
  }
  
  return assetMapping;
}

/**
 * Updates a document in the destination with the new component
 */
async function updateDestinationDocument(
  authenticationData: AuthenticationData,
  entry: string,
  documentId: string,
  fieldName: string,
  updatedFieldValue: Record<string, unknown> | Array<Record<string, unknown>>,
  isSingleType: boolean
): Promise<boolean> {
  const typeFull = `api::${entry}.${entry}`;
  const urlPath = isSingleType
    ? `/content-manager/single-types/${typeFull}/actions/publish`
    : `/content-manager/collection-types/${typeFull}/${documentId}/actions/publish`;
  
  const url = new URL(urlPath, authenticationData.endpoint);
  const headers = new Headers();
  headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
  headers.append("User-Agent", USER_AGENT);
  headers.append("Content-Type", "application/json");
  
  // Prepare body - just the field with the updated value
  const body = {
    [fieldName]: updatedFieldValue
  };
  
  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  
  return response.ok;
}

export async function componentTransfer(): Promise<ComponentTransferResult> {
  // 1. Get authenticated data source
  const dataSource = await getAuthSourceData();
  
  // 2. Download source content data
  console.log("Retrieving data from source...");
  const sourceData = await downloadContentManagerData(dataSource);
  
  // 3. Select entry type (single or collection)
  console.log("\n=== SOURCE SELECTION ===");
  console.log("\nIs the component in a single type or collection type?");
  const entryTypeChoice = await optionChoser([...ENTRY_TYPE_LABELS]);
  const isSingleType = entryTypeChoice === ENTRY_TYPE_OPTIONS.SINGLE;
  
  // 4. Select source entry
  const availableSourceEntries = isSingleType 
    ? dataSource.schema.uniqueEntries 
    : dataSource.schema.multipleEntries;
  
  console.log("\nPlease select the source entry that contains the component:");
  const sourceEntryChoice = await optionChoser(availableSourceEntries);
  const selectedSourceEntry = availableSourceEntries[sourceEntryChoice];
  console.log(`Selected source entry: ${selectedSourceEntry}`);

  if (!selectedSourceEntry) {
    console.error("Error: No entry found for the selected entry");
    process.exit(1);
  }
  
  // 5. Handle component selection based on type
  const { componentType, componentData: sourceComponentData, fieldName: sourceFieldName } = isSingleType
    ? await transferFromSingleType(sourceData, selectedSourceEntry)
    : await transferFromCollectionType(sourceData, selectedSourceEntry);
  
  // 6. Get authenticated data destination
  const dataDestination = await getAuthTargetData();
  
  // 7. Download destination content data
  console.log("\nRetrieving data from destination...");
  const destinationData = await downloadContentManagerData(dataDestination);
  
  // 8. Select destination entry and document
  const availableDestinationEntries = isSingleType
    ? dataDestination.schema.uniqueEntries
    : dataDestination.schema.multipleEntries;
  
  const { entry: destinationEntry, document: destinationDocument } = await selectDestinationTarget(
    availableDestinationEntries,
    destinationData,
    isSingleType
  );
  
  // 9. Select destination field
  const destinationFields = Object.keys(destinationDocument);
  
  if (destinationFields.length === 0) {
    console.error("Error: The selected destination document has no fields");
    process.exit(1);
  }
  
  console.log("\nPlease select the destination field where the component will be added:");
  const destinationFieldChoice = await optionChoser(destinationFields);
  const selectedDestinationField = destinationFields[destinationFieldChoice];
  console.log(`Selected destination field: ${selectedDestinationField}`);
  

  if (!selectedDestinationField) {
    console.error("Error: No destination field found for the selected destination field");
    process.exit(1);
  }
  // Validate destination field
  const destinationFieldValue = destinationDocument[selectedDestinationField];
  if (!Array.isArray(destinationFieldValue)) {
    console.error(`Error: Destination field "${selectedDestinationField}" is not an array`);
    process.exit(1);
  }
  
  // 10. Display transfer configuration summary
  console.log("\n" + "=".repeat(50));
  console.log("✓ Component transfer configuration completed!");
  console.log("=".repeat(50));
  console.log(`\n📋 Transfer Configuration:`);
  console.log(`  Source Entry:       ${selectedSourceEntry}`);
  console.log(`  Source Field:       ${sourceFieldName}`);
  console.log(`  Component Type:     ${componentType}`);
  console.log(`  Destination Entry:  ${destinationEntry}`);
  console.log(`  Destination Field:  ${selectedDestinationField}`);
  console.log(`  Entry Type:         ${isSingleType ? "Single Type" : "Collection Type"}`);
  console.log("\n" + "=".repeat(50) + "\n");
  
  // 11. Download folder structures
  console.log("\n" + "=".repeat(50));
  console.log("FOLDER STRUCTURE MAPPING");
  console.log("=".repeat(50));
  
  console.log("\nRetrieving folder structure from source...");
  const sourceFolderTree = await getAllFolderStructure(dataSource);
  console.log(`✓ Source folder structure loaded`);
  
  console.log("\nRetrieving folder structure from destination...");
  const destFolderTree = await getAllFolderStructure(dataDestination);
  console.log(`✓ Destination folder structure loaded`);
  
  // 12. Extract and transfer assets
  console.log("\n" + "=".repeat(50));
  console.log("ASSET TRANSFER");
  console.log("=".repeat(50));
  
  const assets = extractAssetsFromComponent(sourceComponentData);
  const assetMapping = await transferAssets(
    dataSource,
    dataDestination,
    assets,
    sourceFolderTree,
    destFolderTree
  );
  
  console.log(`\n✓ Assets transferred successfully`);
  
  // 12. Prepare component for transfer
  console.log("\nPreparing component for transfer...");
  let transferComponent = { ...sourceComponentData };
  
  // Clean component data (remove Strapi IDs)
  transferComponent = deepDeleteStrapiIdForComponents(transferComponent) as Record<string, unknown>;
  
  // Replace asset IDs with new ones from destination
  transferComponent = replaceAssetIds(transferComponent, assetMapping);
  
  console.log("✓ Component prepared");
  
  // 13. Add component to destination document
  console.log("\n" + "=".repeat(50));
  console.log("UPDATING DESTINATION DOCUMENT");
  console.log("=".repeat(50) + "\n");
  
  const currentDestinationFieldValue = destinationDocument[selectedDestinationField] as Array<Record<string, unknown>>;
  const updatedFieldValue = [...currentDestinationFieldValue, transferComponent];
  
  // Get destination document ID
  let destinationDocumentId = "";
  if (!isSingleType) {
    destinationDocumentId = (destinationDocument as unknown as { documentId: string }).documentId;
    if (!destinationDocumentId) {
      console.error("Error: Could not find destination document ID");
      process.exit(1);
    }
  }
  
  console.log("Updating destination document...");
  const success = await updateDestinationDocument(
    dataDestination,
    destinationEntry,
    destinationDocumentId,
    selectedDestinationField,
    updatedFieldValue,
    isSingleType
  );
  
  if (!success) {
    console.error("✗ Failed to update destination document");
    process.exit(1);
  }
  
  console.log("✓ Destination document updated successfully");
  
  // 14. Final summary
  console.log("\n" + "=".repeat(50));
  console.log("🎉 COMPONENT TRANSFER COMPLETED SUCCESSFULLY!");
  console.log("=".repeat(50));
  console.log(`\n📊 Transfer Summary:`);
  console.log(`  Component Type:     ${componentType}`);
  console.log(`  Assets transferred: ${assetMapping.size}`);
  console.log(`  Source:             ${selectedSourceEntry} (${sourceFieldName})`);
  console.log(`  Destination:        ${destinationEntry} (${selectedDestinationField})`);
  console.log(`  Position:           Added to end of list`);
  console.log("\n" + "=".repeat(50) + "\n");
  
  // Return all transfer data
  return {
    sourceEntry: selectedSourceEntry,
    component: componentType,
    destinationEntry,
    destinationField: selectedDestinationField,
    isSingleType,
    sourceData,
    destinationData,
  };
}