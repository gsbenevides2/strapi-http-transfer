import { type AuthenticationData } from "@/authentication/retriveData.ts";
import { downloadContentManagerData, type ContentManagerData } from "@/content-manager/download.ts";
import { getMediaCenterData } from "@/media-center/download.ts";
import { clearMediaCenterData } from "@/media-center/clearData.ts";
import { deleteContentManagerData } from "@/content-manager/delete.ts";
import type { IntermediateFolderData } from "@/media-center/types.ts";
import { uploadMediaCenterData } from "@/media-center/upload.ts";
import { uploadContentManagerData } from "@/content-manager/upload.ts";
import { getAuthSourceData, getAuthTargetData } from "@/operations/transfer/utils.ts";

interface SourceData {
    mediaCenterData: IntermediateFolderData;
    contentManagerData: ContentManagerData;
    authenticationData: AuthenticationData;
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