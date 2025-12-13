import { USER_AGENT } from "@/constants.ts";
import console from "node:console";

export interface SchemaData {
    multipleEntries: string[];
    uniqueEntries: string[];
}

export interface AuthenticationData {
    endpoint: string;
    jwtToken: string;
    schema: SchemaData;
}

export async function getSchema(partialAuthenticationData: Omit<AuthenticationData, "schema">): Promise<SchemaData> {
    const url = new URL("/content-type-builder/schema", partialAuthenticationData.endpoint);
    const headers = new Headers();
    headers.append("Authorization", `Bearer ${partialAuthenticationData.jwtToken}`);
    headers.append("User-Agent", USER_AGENT);
    const response = await fetch(url.toString(), {
        method: "GET",
        headers,
    });
    const schemaData = await response.json() as {
        data: {
            components: unknown;
            contentTypes: Record<string, {
                modelName: string;
                kind: "collectionType" | "singleType";
            }>;
        }
    };
    const keys = Object.keys(schemaData.data.contentTypes).filter(key=>key.startsWith("api::"));
    const multipleEntries = keys.map(key=> {
        const result = schemaData.data.contentTypes[key];
        if(!result){
            return undefined;
        }
        const modelName = result.modelName;
        if(!modelName){
            return undefined;
        }
        if(result.kind !== "collectionType"){
            return undefined;
        }
        return modelName;
    }).filter((modelName): modelName is string => typeof modelName === "string");
    const uniqueEntries = keys.map(key=> {
        const result = schemaData.data.contentTypes[key];
        if(!result){
            return undefined;
        }
        const modelName = result.modelName;
        if(!modelName){
            return undefined;
        }
        if(result.kind !== "singleType"){
            return undefined;
        }
        return modelName;
    }).filter((modelName): modelName is string => typeof modelName === "string");
    return { multipleEntries, uniqueEntries };
}

interface QuestData {
    endpoint: string;
    email: string;
    password: string;
}


export async function retriveAuthenticationData(questData: QuestData): Promise<string> {
    console.log("Retrieving authentication data...");
    const { endpoint, email, password } = questData;

    const loginUrl = new URL("/admin/login", endpoint);
    const loginHeaders = new Headers();
    loginHeaders.append("Content-Type", "application/json");
    loginHeaders.append("User-Agent", USER_AGENT);
    const loginBody = JSON.stringify({
        email,
        password,
    });
    const loginResponse = await fetch(loginUrl.toString(), {
        method: "POST",
        headers: loginHeaders,
        body: loginBody,
    });
    const loginData = await loginResponse.json() as { data?: { token?: string } };
    const jwtToken = loginData?.data?.token;
    if (!jwtToken) {
        throw new Error(`Failed to login with email: ${email} and password: ${password} and the response was: ${JSON.stringify(loginData)}`);
    }
    return jwtToken;
    
}

