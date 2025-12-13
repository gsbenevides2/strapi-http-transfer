import console from "node:console";
import { makeQuestion } from "@/utils/makeQuestion.ts";
import { instancesManager } from "@/instances-manager/index.ts";

export async function addInstance(){
    console.log("Adding an instance");
    const name = await makeQuestion("Enter the name of the instance: ");
    const url = await makeQuestion("Enter the URL of the instance: ");
    const email = await makeQuestion("Enter the email of the instance: ");
    const password = await makeQuestion("Enter the password of the instance: ");
    const instance = { name, url, email, password };
    instancesManager.addInstance(instance);
    console.log("Instance added successfully");
}