import type { AuthenticationData } from "@/authentication/retriveData.ts";
import { USER_AGENT } from "@/constants.ts";
import { deepDeleteStrapiIdForComponents, deleteObjectProperties, getCollectionTypeDocumentsIds, getSingleType, propertiesToDelete } from "./utils.ts";

export interface ContentManagerData {
    singleTypes: Record<string, object>;
    collectionTypes: Record<string, object[]>;
}

async function getDocumentOfCollectionType(authenticationData: AuthenticationData, type: string, documentId: string){
    const typeFull = `api::${type}.${type}`;
    const url = new URL(`/content-manager/collection-types/${typeFull}/${documentId}`, authenticationData.endpoint);
    const headers = new Headers();
    headers.append("Authorization", `Bearer ${authenticationData.jwtToken}`);
    headers.append("User-Agent", USER_AGENT);
    const response = await fetch(url.toString(), {
        method: "GET",
        headers,
    });
    const data = await response.json() as { data: object };
    const cleanedData = deleteObjectProperties(data.data, propertiesToDelete);
    return deepDeleteStrapiIdForComponents(cleanedData);
}

async function getCollectionTypeDocuments(authenticationData: AuthenticationData, type: string){
    const docuemntsIds = await getCollectionTypeDocumentsIds(authenticationData, type);
    const documents: object[] = [];
    for(const documentId of docuemntsIds){
        const data = await getDocumentOfCollectionType(authenticationData, type, documentId);
        documents.push(data);
    }
    return documents;
}

export async function downloadContentManagerData(authenticationData: AuthenticationData){
    const singleTypes: Record<string, object> = {};
    for(const type of authenticationData.schema.uniqueEntries){
        const data = await getSingleType(authenticationData, type);
        singleTypes[type] = data;
    }
    const collectionTypes: Record<string, object[]> = {};
    for(const type of authenticationData.schema.multipleEntries){
        const data = await getCollectionTypeDocuments(authenticationData, type);
        collectionTypes[type] = data;
    }
    return {
        singleTypes,
        collectionTypes,
    };
}
