import console from "node:console";
import type { AuthenticationData } from "@/authentication/retriveData.ts";
import { USER_AGENT } from "@/constants.ts";
import { getSingleType, getCollectionTypeDocumentsIds,  } from "@/content-manager/utils.ts";

async function deleteSingleType(authenticationData: AuthenticationData, entry: string){
    const typeFull = `api::${entry}.${entry}`;
    const url = new URL(`/content-manager/single-types/${typeFull}`, authenticationData.endpoint);
    const headers = new Headers();
    headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
    headers.append("User-Agent", USER_AGENT);
    const response = await fetch(url.toString(), {
        method: "DELETE",
        headers,
    });
    return response.ok;
}

async function deleteCollectionType(authenticationData: AuthenticationData, entry: string, documentIds: string[]){
    const typeFull = `api::${entry}.${entry}`;
    const url = new URL(`/content-manager/collection-types/${typeFull}/actions/bulkDelete`, authenticationData.endpoint);
    const headers = new Headers();
    headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
    headers.append("User-Agent", USER_AGENT);
    headers.append("Content-Type", "application/json");
    const response = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({ documentIds }),
    });
    return response.ok;
}


export async function deleteContentManagerData(authenticationData: AuthenticationData){
    console.log("Deleting content manager data...");
    const singleTypeToDelete: string[] = [];
    for(const entry of authenticationData.schema.uniqueEntries){
        const data = await getSingleType(authenticationData, entry);
        const documentId = "documentId" in data ? data.documentId : undefined;
        if(documentId){
            singleTypeToDelete.push(entry)
        }
    }
    const collectionTypesToDelete: Record<string, string[]> = {};
    for(const entry of authenticationData.schema.multipleEntries){
        const data = await getCollectionTypeDocumentsIds(authenticationData, entry);
        collectionTypesToDelete[entry] = data;
    }
    

    for(const entry of singleTypeToDelete){
        await deleteSingleType(authenticationData, entry);
    }
    for(const entry of Object.keys(collectionTypesToDelete)){
        const documentIds = collectionTypesToDelete[entry as keyof typeof collectionTypesToDelete];
        if(!documentIds){
            continue;
        }
        await deleteCollectionType(authenticationData, entry, documentIds);
    }
    console.log("Content manager data deleted successfully");
}
