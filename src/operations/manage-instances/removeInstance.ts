import console from "node:console";
import { optionChoser } from "@/utils/optionChoser.ts";
import { instancesManager } from "@/instances-manager/index.ts";

export async function removeInstance(){
    console.log("Deleting an instance");
    console.log("Select the instance to delete:");
    const instances = instancesManager.listInstances();
    if(instances.length === 0){
        console.log("No instances to delete");
        return;
    }
    const choice = await optionChoser(instances.map(instance => instance.name));
    const instanceName = instances[choice]?.name;
    if(!instanceName){
        console.log("Invalid choice");
        return;
    }
    instancesManager.removeInstance(instanceName);
    console.log("Instance deleted successfully");
}