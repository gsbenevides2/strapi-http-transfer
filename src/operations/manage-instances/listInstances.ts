import console from "node:console";
import { instancesManager } from "@/instances-manager/index.ts";

export function listInstances(){
    console.log("Listing instances");
    const instances = instancesManager.listInstances();
    if(instances.length === 0){
        console.log("No instances to list");
        return;
    }
    console.table(instances);
    console.log("Instances listed successfully");
}