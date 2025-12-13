import { getSchema, retriveAuthenticationData, type AuthenticationData } from "@/authentication/retriveData.ts";
import { downloadContentManagerData, type ContentManagerData } from "@/content-manager/download.ts";
import { getMediaCenterData } from "@/media-center/download.ts";
import { clearMediaCenterData } from "@/media-center/clearData.ts";
import { deleteContentManagerData } from "@/content-manager/delete.ts";
import type { IntermediateFolderData } from "@/media-center/types.ts";
import { uploadMediaCenterData } from "@/media-center/upload.ts";
import { uploadContentManagerData } from "@/content-manager/upload.ts";
import { instancesManager } from "@/instances-manager/index.ts";
import { optionChoser } from "@/utils/optionChoser.ts";
import console from "node:console";
import process from "node:process";

interface SourceData {
    mediaCenterData: IntermediateFolderData;
    contentManagerData: ContentManagerData;
    authenticationData: AuthenticationData;
}

async function getAuthSourceData(): Promise<AuthenticationData> {
    console.log("Please provide the source of data:")
    const instances = instancesManager.listInstances();
    if(instances.length === 0){
        console.log("No instances to list");
        process.exit(1);
    }
    const choice = await optionChoser(instances.map(instance => instance.name));
    const instance = instances[choice];
    if(!instance){
        console.log("Invalid choice");
        process.exit(1);
    }
    const { url, email, password } = instance;

    const jwtToken = await retriveAuthenticationData({
        endpoint: url,
        email: email,
        password: password,
    });
    const schema = await getSchema({ endpoint: process.env.SOURCE_ENDPOINT!, jwtToken: jwtToken });
    return { endpoint: url, jwtToken: jwtToken, schema: schema };
}

async function getAuthTargetData(): Promise<AuthenticationData> {
    console.log("Please provide the target of data:")
    const instances = instancesManager.listInstances();
    if(instances.length === 0){
        console.log("No instances to list");
        process.exit(1);
    }
    const choice = await optionChoser(instances.map(instance => instance.name));
    const instance = instances[choice];
    if(!instance){
        console.log("Invalid choice");
        process.exit(1);
    }
    const { url, email, password } = instance;
    const jwtToken = await retriveAuthenticationData({
        endpoint: url,
        email: email,
        password: password,
    });
    const schema = await getSchema({ endpoint: url, jwtToken: jwtToken });
    return { endpoint: url, jwtToken: jwtToken, schema: schema };
}

async function getSourceData(): Promise<SourceData>{
    const data = await getAuthSourceData();
    const mediaCenterData = await getMediaCenterData(data);
    const contentManagerData = await downloadContentManagerData(data);
    return { mediaCenterData, contentManagerData, authenticationData: data };
}

async function sendDataToTarget(sourceData: SourceData){
    const data = await getAuthTargetData();
    await clearMediaCenterData(data);
    await deleteContentManagerData(data);
    const mediaCenterResult = await uploadMediaCenterData(data, sourceData.mediaCenterData);
    await uploadContentManagerData(data, sourceData.contentManagerData, mediaCenterResult);
}

export async function totalTransfer(){
    const sourceData = await getSourceData();
    await sendDataToTarget(sourceData);
  
}