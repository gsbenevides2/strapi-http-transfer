import type { AuthenticationData } from "@/authentication/retriveData.ts";
import { USER_AGENT } from "@/constants.ts";
import type { FileData, FolderData, IntermediateFileData } from "@/media-center/types.ts";

export async function makeFolderRequest(authenticationData: AuthenticationData, parentId?: string, path?: string, page?: number, pageSize?: number){
    const url = new URL('/upload/folders', authenticationData.endpoint);
    url.searchParams.set('page', page?.toString() ?? "1");
    url.searchParams.set('pageSize', pageSize?.toString() ?? "100");
    if(parentId && path){
        url.searchParams.set('folderPath', path);
        url.searchParams.set('filters[$and][0][parent][id]', parentId);
    }else {
        url.searchParams.set('filters[$and][0][parent][id][$null]', "true");
    }
    url.searchParams.set('sort', 'createdAt:DESC');
    const headers = new Headers();
    headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
    headers.append("User-Agent", USER_AGENT);
    const response = await fetch(url.toString(), {
        method: "GET",
        headers,
    });
    return await response.json() as FolderData;
}

export async function makeFileRequest(authenticationData: AuthenticationData, folderPath: string, page?: number, pageSize?: number){
    const url = new URL('/upload/files', authenticationData.endpoint);
    url.searchParams.set('filters[$and][0][folderPath][$eq]', folderPath);
    url.searchParams.set('page', page?.toString() ?? "1");
    url.searchParams.set('pageSize', pageSize?.toString() ?? "100");
    url.searchParams.set('sort', 'createdAt:DESC');
    const headers = new Headers();
    headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
    headers.append("User-Agent", USER_AGENT);
    const response = await fetch(url.toString(), {
        method: "GET",
        headers,
    });
    return await response.json() as FileData;
}

export function normalizeFileUrl(authenticationData: AuthenticationData, url: string){
    if(url.startsWith("http")){
        return url;
    }
    return new URL(url, authenticationData.endpoint).toString();
}

export async function getFilesOfFolder(authenticationData: AuthenticationData, folderPath: string){
    let currentPage = 1;
    const pageSize = 100;
    const intermediateFileData: IntermediateFileData[] = [];
    while(true){
        const fileData = await makeFileRequest(authenticationData, folderPath, currentPage, pageSize);
        for(const fileItem of fileData.results){
            intermediateFileData.push({
                id: fileItem.id,
                name: fileItem.name,
                url: await normalizeFileUrl(authenticationData, fileItem.url),
                folderPath: fileItem.folderPath,
            });
        }
        if(fileData.results.length < pageSize){
            break;
        }
        currentPage++;
    }
    return intermediateFileData;
}