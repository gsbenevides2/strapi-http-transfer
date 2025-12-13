import type { AuthenticationData } from "@/authentication/retriveData.ts";
import { USER_AGENT } from "@/constants.ts";
import fs from "node:fs";
import console from "node:console";
import { Buffer } from "node:buffer";
import type { IntermediateFileData, IntermediateFolderData } from "@/media-center/types.ts";
import { getFilesOfFolder, makeFolderRequest } from "@/media-center/utils.ts";

async function getFolderData(authenticationData: AuthenticationData, path?: string, parentId?: string){
    let currentPage = 1;
    const pageSize = 100;
    const intermediateFolderData: IntermediateFolderData[] = [];
    while(true){
        const folderData = await makeFolderRequest(authenticationData, parentId, path, currentPage, pageSize);
        for(const folderItem of folderData.data){
            let childrenFolders: IntermediateFolderData[] = [];
            let files: IntermediateFileData[] = [];
            if(folderItem.children.count > 0){
                childrenFolders = await getFolderData(authenticationData, folderItem.path, folderItem.id.toString());
            }
            if(folderItem.files.count > 0){
                files = await getFilesOfFolder(authenticationData, folderItem.path);
            }
            intermediateFolderData.push({
                name: folderItem.name,
                path: folderItem.path,
                id: folderItem.id,
                pathId: folderItem.pathId,
                hasChildrenFolders: folderItem.children.count > 0,
                childrenFolders: childrenFolders,
                files: files,
            });
            
        }
        if(folderData.data.length < pageSize){
            break;
        }
        currentPage++;
    }
    return intermediateFolderData;
}

async function getAllFolderData(authenticationData: AuthenticationData){
    const subFolders = await getFolderData(authenticationData);
    const files = await getFilesOfFolder(authenticationData, "/");
    const rootFolderData: IntermediateFolderData = {
        name: "root",
        path: "/",
        id: -1,
        pathId: 0,
        hasChildrenFolders: subFolders.length > 0,
        childrenFolders: subFolders,
        files: files,
    }
    return rootFolderData;
}

async function makeAssetsFolderAndCleanUp(){
    const exists = fs.existsSync("assets");
    if(exists){
        await fs.rmSync("assets", { recursive: true });
    }
    await fs.mkdirSync("assets", { recursive: true });
}

async function downloadAllFiles(folderData: IntermediateFolderData){
    for(const file of folderData.files){
        const headers = new Headers();
        headers.append("User-Agent", USER_AGENT);
        const response = await fetch(file.url, {
            headers,
        });
        const blob = await response.arrayBuffer();
        await fs.writeFileSync(`assets/${file.id}`, Buffer.from(blob));
    }
    for(const folder of folderData.childrenFolders){
        await downloadAllFiles(folder);
    }
}

export async function getMediaCenterData(authenticationData: AuthenticationData){
    console.log("Retrieving media center data...");
    const folderData = await getAllFolderData(authenticationData);
    console.log("Downloading all files...");
    await makeAssetsFolderAndCleanUp();
    await downloadAllFiles(folderData);
    console.log("Media center data retrieved and downloaded successfully");
    return folderData;
}