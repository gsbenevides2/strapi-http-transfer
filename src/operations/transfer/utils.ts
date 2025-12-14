import { instancesManager } from "@/instances-manager/index.ts";
import { optionChoser } from "@/utils/optionChoser.ts";
import console from "node:console";
import process from "node:process";
import { retriveAuthenticationData } from "@/authentication/retriveData.ts";
import { getSchema } from "@/authentication/retriveData.ts";
import type { AuthenticationData } from "@/authentication/retriveData.ts";

export async function getAuthSourceData(): Promise<AuthenticationData> {
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
    const schema = await getSchema({ endpoint: url, jwtToken: jwtToken });
    return { endpoint: url, jwtToken: jwtToken, schema: schema };
}

export async function getAuthTargetData(): Promise<AuthenticationData> {
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