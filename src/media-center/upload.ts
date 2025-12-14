import console from "node:console";
import type { AuthenticationData } from "@/authentication/retriveData.ts";
import { USER_AGENT } from "@/constants.ts";
import type { IntermediateFileData, IntermediateFolderData } from "@/media-center/types.ts";
import fs from "node:fs";
import mime from "mime"

interface FolderCreationData {
    data:{
        id: number;
    }
}

async function createFolder(authenticationData: AuthenticationData, name: string, parent?: number){
    const url = new URL('/upload/folders', authenticationData.endpoint);
    const headers = new Headers();
    headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
    headers.append("User-Agent", USER_AGENT);
    headers.append("Content-Type", "application/json");
    const body = { name, parent}
    const response = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    return await response.json() as FolderCreationData;
}

interface FileCreationData {
        id: number;
}

async function uploadFile(authenticationData: AuthenticationData, file: IntermediateFileData, folderId?: number, fileReplacementId?: number){
    const url = new URL('/upload', authenticationData.endpoint);
    if(fileReplacementId){
        url.searchParams.set("id", fileReplacementId.toString());
    }
    // Don't set Content-Type when sending FormData: the boundary is set automatically
    const headers = new Headers();
    headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
    headers.append("User-Agent", USER_AGENT);
    const body = new FormData();
    const fileContent = fs.readFileSync(`assets/${file.id}`);
    const blob = new Blob([fileContent], {
        type: mime.getType(file.name) ?? undefined,
    });
    body.append("files", blob);
    body.append("fileInfo", JSON.stringify({ folder: folderId, name: file.name }));
    const response = await fetch(url.toString(), {
        method: "POST",
        headers,
        body,
    });
    const responseJson = await response.json() as FileCreationData[];
    console.log(responseJson);
    return responseJson
}

async function createTreeStructure(authenticationData: AuthenticationData, source: IntermediateFolderData){
    const newChildrenFolders: IntermediateFolderData[] = [];
    for(const folder of source.childrenFolders){
        const parentId = source.createFolderId;
        const newFolder = await createFolder(authenticationData, folder.name, parentId);
        folder.createFolderId = newFolder.data.id;

        const newFiles: IntermediateFileData[] = [];
        for(const file of folder.files){
            const newFile = await uploadFile(authenticationData, file, folder.createFolderId);
            file.createFileId = newFile[0]?.id;
            newFiles.push(file);
        }
        folder.files = newFiles;
        const newFolderData = await createTreeStructure(authenticationData, folder);
        newChildrenFolders.push(newFolderData);
    }

    if(source.name === "root"){
        const newFiles: IntermediateFileData[] = [];
        for(const file of source.files){
            const newFile = await uploadFile(authenticationData, file, source.createFolderId);
            file.createFileId = newFile[0]?.id;
            newFiles.push(file);
        }
        source.files = newFiles;
    }

    source.childrenFolders = newChildrenFolders;
    return source;
}

export async function uploadMediaCenterData(authenticationData: AuthenticationData, source: IntermediateFolderData){
    console.log("Uploading media center data...");
    const rootFolder = await createTreeStructure(authenticationData, source);
    console.log("Media center data uploaded successfully");
    return rootFolder;
}