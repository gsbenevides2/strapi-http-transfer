import type { AuthenticationData } from "@/authentication/retriveData.ts";
import { USER_AGENT } from "@/constants.ts";

export const propertiesToDelete = ["createdAt", "updatedAt", "publishedAt", "publishedAt", "publishedAt", "createdBy", "id", "updatedBy", "localizations", "status", "locale"];

export function deleteObjectProperties(object: object, properties: string[]){
    for(const property of properties){
        delete object[property as keyof typeof object];
    }
    return object;
}

export function deepDeleteStrapiIdForComponents(object: object){
    if(typeof object !== "object" || object === null){
        return object;
    }
    const keys = Object.keys(object);
    
    if(keys.includes("__component") && keys.includes("id")){
        delete object["id" as keyof typeof object];
    }else if(keys.includes("id") && !keys.includes("documentId")){
        delete object["id" as keyof typeof object];
    }

    for(const key of keys){
        if(typeof object[key as keyof typeof object] === "object"){
            deepDeleteStrapiIdForComponents(object[key as keyof typeof object]);
        }
    }
    return object;
}

export async function getCollectionTypeDocumentsIds(authenticationData: AuthenticationData, type: string){
    const docuemntsIds: string[] = [];
    let currentPage = 1;
    const typeFull = `api::${type}.${type}`;
    const pageSize = 100;
    while(true){
        const url = new URL(`/content-manager/collection-types/${typeFull}`, authenticationData.endpoint);
        url.searchParams.set('status', 'published');
        url.searchParams.set('page', currentPage.toString());
        url.searchParams.set('pageSize', pageSize.toString());
        const headers = new Headers();
        headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
        headers.append("User-Agent", USER_AGENT);
        const response = await fetch(url.toString(), {
            method: "GET",
            headers,
        });
        const data = await response.json() as {
            results: {
                documentId: string;
            }[];
        };
        for(const result of data.results){
            docuemntsIds.push(result.documentId);
        }
        if(data.results.length < pageSize){
            break;
        }
        currentPage++;
    }
    return docuemntsIds;
}

export async function getSingleType(authenticationData: AuthenticationData, type: string){
    const typeFull = `api::${type}.${type}`;
    const url = new URL(`/content-manager/single-types/${typeFull}`, authenticationData.endpoint);
    url.searchParams.set('status', 'published');
    const headers = new Headers();
    headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
    headers.append("User-Agent", USER_AGENT);
    const response = await fetch(url.toString(), {
        method: "GET",
        headers,
    });
    const data = await response.json() as { data?: object };
    if(!data.data){
        return {};
    }
    const cleanedData = deleteObjectProperties(data.data, propertiesToDelete);
    return deepDeleteStrapiIdForComponents(cleanedData);
}

