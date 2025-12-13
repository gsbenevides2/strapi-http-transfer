import console from "node:console";
import type { AuthenticationData } from "@/authentication/retriveData.ts";
import type { IntermediateFolderData, IntermediateFileData } from "@/media-center/types.ts";
import { getFilesOfFolder, makeFolderRequest } from "@/media-center/utils.ts";
import { USER_AGENT } from "@/constants.ts";

async function getRootFoldersList(authenticationData: AuthenticationData){
    let currentPage = 1;
    const pageSize = 100;
    const intermediateFolderData: IntermediateFolderData[] = [];
    while(true){
        const folderData = await makeFolderRequest(authenticationData, undefined, undefined, currentPage, pageSize);
        for(const folderItem of folderData.data){
            let childrenFolders: IntermediateFolderData[] = [];
            let files: IntermediateFileData[] = [];
            if(folderItem.children.count > 0){
                childrenFolders = [];
            }
            if(folderItem.files.count > 0){
                files = [];
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

async function deleteMediaCenterData(authenticationData: AuthenticationData, fileIds: number[], folderIds: number[]){
    const url = new URL('/upload/actions/bulk-delete', authenticationData.endpoint);
    const headers = new Headers();
    headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
    headers.append("User-Agent", USER_AGENT);
    headers.append("Content-Type", "application/json");
    const response = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({ fileIds, folderIds }),
    });
    return response.ok;
}


export async function clearMediaCenterData(authenticationData: AuthenticationData){
    console.log("Clearing media center data...");
    const rootFoldersList = await getRootFoldersList(authenticationData);
    const rootFilesList = await getFilesOfFolder(authenticationData, "/");
    await deleteMediaCenterData(authenticationData, rootFilesList.map(file => file.id), rootFoldersList.map(folder => folder.id));
    console.log("Deleted media center data successfully");
}