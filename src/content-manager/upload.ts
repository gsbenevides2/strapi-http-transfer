import console from "node:console";
import type { AuthenticationData } from "@/authentication/retriveData.ts";
import type { IntermediateFileData, IntermediateFolderData,  } from "@/media-center/types.ts";
import { USER_AGENT } from "@/constants.ts";
import type { ContentManagerData } from "./download.ts";

function extractAllFiles(folderData: IntermediateFolderData): IntermediateFileData[]{
    const files: IntermediateFileData[] = [];
    for(const file of folderData.files){
        files.push(file);
    }
    for(const folder of folderData.childrenFolders){
        files.push(...extractAllFiles(folder));
    }
    return files;
}

function deepImageReplace(source: Record<string, unknown>, fileList: IntermediateFileData[]){
    if(typeof source !== "object" || source === null){
        return source;
    }
    const keys = Object.keys(source);
    type SourceKey = keyof typeof source;
    const imageKeys = ["id", "documentId", "url", "hash"]
    const isImageObj = imageKeys.every(key => keys.includes(key));
    if(isImageObj){
        const newFileId = fileList.find(file => file.id === source["id" as keyof typeof source])?.createFileId
        if(newFileId){
            source = {id: newFileId}
        }
    }
    for(const key of keys){
        if(typeof source[key as SourceKey] === "object"){
            source[key as SourceKey] = deepImageReplace(source[key as SourceKey] as Record<string, unknown>, fileList);
        }
    }
    return source;
}

function createSingleOrCollectionType(source: object, fileList: IntermediateFileData[]){
    delete source["documentId" as keyof typeof source];
    return deepImageReplace(source as Record<string, unknown>, fileList);
}

async function uploadSingleType(authenticationData: AuthenticationData, entry: string, source: object){
    const typeFull = `api::${entry}.${entry}`;
    const url = new URL(`/content-manager/single-types/${typeFull}/actions/publish`, authenticationData.endpoint);
    const headers = new Headers();
    headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
    headers.append("User-Agent", USER_AGENT);
    headers.append("Content-Type", "application/json");
    const response = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(source),
    });
    return response.ok;
}

async function uploadCollectionType(authenticationData: AuthenticationData, entry: string, source: object){
    const typeFull = `api::${entry}.${entry}`;
    const url = new URL(`/content-manager/collection-types/${typeFull}/actions/publish`, authenticationData.endpoint);
    const headers = new Headers();
    headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
    headers.append("User-Agent", USER_AGENT);
    headers.append("Content-Type", "application/json");
    const response = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(source),
    });
    return response.ok;
}

export async function uploadContentManagerData(authenticationData: AuthenticationData, source: ContentManagerData, folderData: IntermediateFolderData){
    const allFiles = extractAllFiles(folderData);
    console.log("Uploading content manager data...");
    for(const entry of Object.keys(source.singleTypes)){
        const entryData = source.singleTypes[entry as keyof typeof source.singleTypes];
        if(!entryData){
            continue;
        }
        const response = await createSingleOrCollectionType(entryData, allFiles);
        await uploadSingleType(authenticationData, entry, response);
    }
    for(const entry of Object.keys(source.collectionTypes)){
        const entryData = source.collectionTypes[entry as keyof typeof source.collectionTypes];
        if(!entryData){
            continue;
        }
        for(const document of entryData){
            const response = await createSingleOrCollectionType(document, allFiles);
            await uploadCollectionType(authenticationData, entry, response);
        }
    }
    console.log("Content manager data uploaded successfully");
}