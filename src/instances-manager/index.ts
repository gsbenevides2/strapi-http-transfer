import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface Instance {
    name: string;
    url: string;
    email: string;
    password: string;
}

export const instancesManager = {
    addInstance(instance: Instance){
        const instances = this.listInstances();
        if(instances.find((instance: Instance) => instance.name === instance.name)){
            throw new Error(`Instance with name ${instance.name} already exists`);
        }
        instances.push(instance);
        this.fileSync("write", instances);
    },
    removeInstance(name: string){
        let instances = this.listInstances();
        instances = instances.filter(instance => instance.name !== name);
        this.fileSync("write", instances);
    },
    getInstance(name: string){
        const instances = this.listInstances();
        return instances.find((instance: Instance) => instance.name === name) || null;
    },
    listInstances(): Instance[]{
        return this.fileSync("read") as Instance[];
    },
    fileSync(operation: "read" | "write", data?: Instance[]){
        const filePath = path.join(os.homedir(), "strapi-sync-instances.json");
        if(operation === "read"){
            const exists = fs.existsSync(filePath);
            if(!exists){
                return [];
            }
            const data = fs.readFileSync(filePath, "utf8");
            return JSON.parse(data);
        }else {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        }
    }
}